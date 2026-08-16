import { spawn, spawnSync, type ChildProcess, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createWriteStream } from "node:fs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

// Everything GitTube persists locally lives under this directory.
export const DATA_DIR = process.env.GITTUBE_HOME || path.join(os.homedir(), ".gittube");
const BIN_DIR = path.join(DATA_DIR, "bin");
export const DOWNLOADS_DIR = path.join(DATA_DIR, "downloads");
const JOBS_DIR = path.join(DOWNLOADS_DIR, "jobs");

export const PROGRESS_LOG = "progress.log";
export const DONE_FLAG = "done.flag";

// User agent to bypass basic bot detection.
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export function generateDownloadId(): string {
  return `dl-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * Quote a single argument for safe use inside a `sh -c "..."` string.
 */
export function shQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

// ---------------------------------------------------------------------------
// yt-dlp binary resolution
// ---------------------------------------------------------------------------

function ytDlpAssetName(): string {
  const { platform, arch } = process;
  switch (platform) {
    case "darwin":
      return "yt-dlp_macos";
    case "linux":
      if (arch === "arm64") return "yt-dlp_linux_aarch64";
      if (arch === "arm") return "yt-dlp_linux_armv7l";
      return "yt-dlp_linux";
    case "win32":
      if (arch === "arm64") return "yt-dlp_arm.exe";
      if (arch === "ia32") return "yt-dlp_x86.exe";
      return "yt-dlp.exe";
    default:
      return "yt-dlp";
  }
}

/**
 * Downloads the standalone yt-dlp binary for the current platform into the
 * GitTube cache directory. Returns the path to the cached binary.
 */
async function downloadYtDlp(): Promise<string> {
  ensureDir(BIN_DIR);
  const target = path.join(BIN_DIR, ytDlpAssetName());
  const part = `${target}.part`;
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ytDlpAssetName()}`;

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download yt-dlp (HTTP ${res.status})`);
  }

  await new Promise<void>((resolve, reject) => {
    const fileStream = createWriteStream(part);
    const reader = res.body!.getReader();

    const pump = () =>
      reader
        .read()
        .then(({ done, value }) => {
          if (done) {
            fileStream.end(() => resolve());
            return;
          }
          if (!fileStream.write(Buffer.from(value))) {
            fileStream.once("drain", pump);
          } else {
            pump();
          }
        })
        .catch((err) => {
          fileStream.destroy();
          reject(err);
        });

    fileStream.on("error", reject);
    pump();
  });

  if (process.platform !== "win32") {
    fs.chmodSync(part, 0o755);
  }
  fs.renameSync(part, target);
  return target;
}

/**
 * Resolves the yt-dlp binary path: $YTDLP_PATH → cached binary → system binary.
 * Downloads the standalone binary into the cache on first use.
 */
export async function getYtDlpPath(): Promise<string> {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;

  const cached = path.join(BIN_DIR, ytDlpAssetName());
  if (!fs.existsSync(cached)) {
    try {
      return await downloadYtDlp();
    } catch (err) {
      const system = findSystemBinary("yt-dlp");
      if (system) return system;
      throw err;
    }
  }
  return cached;
}

// ---------------------------------------------------------------------------
// ffmpeg binary resolution
// ---------------------------------------------------------------------------

export function findSystemBinary(name: string): string | null {
  const which = process.platform === "win32" ? "where" : "which";
  try {
    const res = spawnSync(which, [name], { encoding: "utf8" });
    if (res.status === 0 && res.stdout) {
      return res.stdout.split("\n")[0].trim() || null;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Resolves the ffmpeg binary path: $FFMPEG_PATH → bundled ffmpeg-static →
 * system ffmpeg. Returns null if none is available (yt-dlp can still download
 * combined formats without it).
 */
export async function resolveFfmpegPath(): Promise<string | null> {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;

  const bundled = bundledFfmpegPath();
  if (bundled) return bundled;

  return findSystemBinary("ffmpeg");
}

/**
 * Locates the ffmpeg-static binary bundled inside the app's node_modules.
 * Searches a few candidate roots: the standalone server dir (dev), and the
 * app root where electron-builder places production dependencies (packaged).
 */
function bundledFfmpegPath(): string | null {
  const bases = [
    process.cwd(),
    path.resolve(process.cwd(), ".."),
    path.resolve(process.cwd(), "../.."),
    path.resolve(process.cwd(), "../../.."),
  ];
  for (const base of bases) {
    for (const name of ["ffmpeg", "ffmpeg.exe"]) {
      const candidate = path.join(base, "node_modules", "ffmpeg-static", name);
      if (fs.existsSync(/* turbopackIgnore: true */ candidate)) return candidate;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Download jobs
// ---------------------------------------------------------------------------

interface Job {
  id: string;
  dir: string;
  logFile: string;
  doneFlag: string;
  process?: ChildProcess;
  startedAt: number;
}

const jobs = new Map<string, Job>();

interface BuildArgsOptions {
  url: string;
  format: "video" | "audio";
  quality: string;
}

/**
 * Builds the yt-dlp argument list (anti-bot flags + format/quality selection)
 * shared between the video-info lookup and the actual download.
 */
export function buildYtDlpArgs({ url, format, quality }: BuildArgsOptions): string[] {
  const args: string[] = [
    "--newline",
    "-o",
    "%(title)s.%(ext)s",
    "--no-check-certificates",
    "--user-agent",
    USER_AGENT,
    "--extractor-args",
    "youtube:player_client=web,default;skip=hls,dash",
    "--no-playlist",
  ];

  if (format === "audio") {
    args.push("-x", "--audio-format", "mp3");
    if (quality === "128k") {
      args.push("--audio-quality", "128K");
    } else if (quality === "192k") {
      args.push("--audio-quality", "192K");
    } else {
      args.push("--audio-quality", "320K");
    }
  } else {
    if (quality === "2160p") {
      args.push("-f", "bestvideo[height<=2160]+bestaudio/best[height<=2160]");
    } else if (quality === "1080p") {
      args.push("-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]");
    } else if (quality === "720p") {
      args.push("-f", "bestvideo[height<=720]+bestaudio/best[height<=720]");
    } else if (quality === "480p") {
      args.push("-f", "bestvideo[height<=480]+bestaudio/best[height<=480]");
    } else {
      args.push("-f", "best");
    }
  }

  args.push(url);
  return args;
}

/**
 * Starts a local yt-dlp download in a dedicated job directory. Progress is
 * captured to a log file and completion is recorded via an exit-code flag, so
 * status can be polled purely by reading files.
 */
export async function startDownload(opts: {
  url: string;
  format: "video" | "audio";
  quality: string;
}): Promise<string> {
  const id = generateDownloadId();
  const dir = path.join(JOBS_DIR, id);
  ensureDir(dir);

  const logFile = path.join(dir, PROGRESS_LOG);
  const doneFlag = path.join(dir, DONE_FLAG);

  const ytDlp = await getYtDlpPath();
  const ffmpeg = await resolveFfmpegPath();

  const args = buildYtDlpArgs(opts);
  if (ffmpeg) {
    args.unshift("--ffmpeg-location", path.dirname(ffmpeg));
  }

  const logFd = fs.openSync(logFile, "a");
  const child = Reflect.apply(spawn, null, [ytDlp, args, {
    cwd: dir,
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: ["ignore", logFd, logFd],
  }]);

  child.on("error", (err) => {
    fs.appendFileSync(logFile, `\n[gittube] process error: ${err.message}\n`);
    fs.writeFileSync(doneFlag, String(1));
    try {
      fs.closeSync(logFd);
    } catch {
      // already closed
    }
  });

  child.on("exit", (code) => {
    fs.writeFileSync(doneFlag, String(code ?? 1));
    try {
      fs.closeSync(logFd);
    } catch {
      // already closed
    }
  });

  jobs.set(id, { id, dir, logFile, doneFlag, process: child, startedAt: Date.now() });
  return id;
}

export interface ParsedProgress {
  progress?: number;
  speed?: string;
  eta?: string;
  filename?: string;
}

/**
 * Parses the accumulated yt-dlp log output for the latest progress, speed,
 * ETA, and destination filename. Mirrors the regexes yt-dlp's `--newline`
 * output follows.
 */
export function parseProgressLog(log: string): ParsedProgress {
  const result: ParsedProgress = {};

  const progressMatches = [...log.matchAll(/(\d+\.?\d*)%/g)];
  if (progressMatches.length > 0) {
    result.progress = parseFloat(progressMatches[progressMatches.length - 1][1]);
  }

  const speedMatches = [...log.matchAll(/(\d+\.?\d*\s*[KMG]?i?B\/s)/g)];
  if (speedMatches.length > 0) {
    result.speed = speedMatches[speedMatches.length - 1][1];
  }

  const etaMatches = [...log.matchAll(/ETA\s+(\d+:\d+)/g)];
  if (etaMatches.length > 0) {
    result.eta = etaMatches[etaMatches.length - 1][1];
  }

  const filenameMatches = [...log.matchAll(/Destination:\s+(.+)/g)];
  if (filenameMatches.length > 0) {
    result.filename = filenameMatches[filenameMatches.length - 1][1].trim().split(/[\\/]/).pop();
  }

  return result;
}

export interface DownloadStatus {
  progress?: number;
  speed?: string;
  eta?: string;
  filename?: string;
  status: "downloading" | "completed" | "error";
  error?: string;
  localPath?: string;
}

function firstDownloadedFile(dir: string): { name: string; absPath: string } | null {
  if (!fs.existsSync(dir)) return null;
  const entries = fs
    .readdirSync(dir)
    .filter((f) => f !== PROGRESS_LOG && f !== DONE_FLAG && f !== ".part");
  for (const entry of entries) {
    const abs = path.join(dir, entry);
    try {
      if (fs.statSync(abs).isFile()) return { name: entry, absPath: abs };
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Returns the absolute path of the downloaded file for a completed job.
 */
export function getDownloadedFile(id: string): { filename: string; absPath: string } | null {
  const file = firstDownloadedFile(path.join(JOBS_DIR, id));
  return file ? { filename: file.name, absPath: file.absPath } : null;
}

/**
 * Reads a job's current status from its log + done-flag files.
 * Returns null when the job is unknown (e.g. after a restart or cleanup).
 */
export function getDownloadStatus(id: string): DownloadStatus | null {
  const job = jobs.get(id);
  const dir = job ? job.dir : path.join(JOBS_DIR, id);
  if (!fs.existsSync(path.join(dir, PROGRESS_LOG))) return null;

  const log = fs.readFileSync(path.join(dir, PROGRESS_LOG), "utf8");
  const parsed = parseProgressLog(log);

  const doneFlag = path.join(dir, DONE_FLAG);
  if (fs.existsSync(doneFlag)) {
    const exitCode = parseInt(fs.readFileSync(doneFlag, "utf8").trim(), 10);
    if (exitCode === 0) {
      const file = firstDownloadedFile(dir);
      return {
        progress: 100,
        status: "completed",
        filename: file?.name || parsed.filename,
        localPath: file?.absPath,
      };
    }
    const tail = log.split("\n").filter(Boolean).slice(-5).join("\n");
    return {
      progress: parsed.progress ?? 0,
      status: "error",
      error: tail || `yt-dlp exited with code ${exitCode}`,
    };
  }

  return {
    progress: parsed.progress ?? 0,
    status: "downloading",
    speed: parsed.speed,
    eta: parsed.eta,
    filename: parsed.filename,
  };
}

/**
 * Stops a running download and removes its temporary job directory.
 */
export function stopDownload(id: string): void {
  const job = jobs.get(id);
  if (job?.process && !job.process.killed) {
    if (process.platform === "win32" && job.process.pid) {
      spawnSync("taskkill", ["/pid", String(job.process.pid), "/T", "/F"], {
        windowsHide: true,
      });
    } else if (job.process.pid) {
      try {
        process.kill(-job.process.pid, "SIGKILL");
      } catch {
        // process may already be gone
      }
      try {
        job.process.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
  }
  try {
    fs.rmSync(job?.dir ?? path.join(JOBS_DIR, id), { recursive: true, force: true });
  } catch {
    // ignore
  }
  jobs.delete(id);
}

// ---------------------------------------------------------------------------
// Video info lookup
// ---------------------------------------------------------------------------

export interface VideoInfoResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs `yt-dlp --dump-json` for a URL and returns its raw output.
 * The process is killed if it exceeds the timeout.
 */
export async function fetchVideoInfo(url: string, timeoutMs = 90_000): Promise<VideoInfoResult> {
  const ytDlp = await getYtDlpPath();
  const args = [
    "--dump-json",
    "--no-download",
    "--no-warnings",
    "--no-check-certificates",
    "--user-agent",
    USER_AGENT,
    "--extractor-args",
    "youtube:player_client=web,default;skip=hls,dash",
    "--no-playlist",
    url,
  ];

  return new Promise((resolve, reject) => {
    const child = Reflect.apply(spawn, null, [ytDlp, args, {
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    }]) as ChildProcessWithoutNullStreams;

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      if (process.platform === "win32" && child.pid) {
        spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
      } else if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          // ignore
        }
      }
      resolve({ exitCode: 1, stdout, stderr: `${stderr}\nyt-dlp timed out after ${timeoutMs / 1000}s` });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

export function contentTypeForExt(ext: string): string {
  const map: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    mkv: "video/x-matroska",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    opus: "audio/opus",
    flac: "audio/flac",
    wav: "audio/wav",
  };
  return map[ext.toLowerCase()] || "application/octet-stream";
}
