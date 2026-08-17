// Shared download engine for GitTube CLI and MCP server.
// Resolves yt-dlp/ffmpeg (standalone download, env override, or system
// binary) and runs downloads/video-info lookups.

import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// ---------------------------------------------------------------------------
// yt-dlp / ffmpeg binary resolution
// ---------------------------------------------------------------------------

export function ytDlpAssetName() {
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

async function downloadYtDlp(target) {
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${ytDlpAssetName()}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download yt-dlp (HTTP ${res.status})`);
  }

  const part = `${target}.part`;
  await new Promise((resolve, reject) => {
    const fileStream = createWriteStream(part);
    const reader = res.body.getReader();

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

export async function getYtDlpPath() {
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;

  const binDir = path.join(process.env.GITTUBE_HOME || path.join(os.homedir(), ".gittube"), "bin");
  const cached = path.join(binDir, ytDlpAssetName());

  if (fs.existsSync(cached)) return cached;
  try {
    fs.mkdirSync(binDir, { recursive: true });
    return await downloadYtDlp(cached);
  } catch (err) {
    const system = findSystemBinary("yt-dlp");
    if (system) return system;
    throw err;
  }
}

export function findSystemBinary(name) {
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

export function resolveFfmpegPath() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;

  try {
    const require = createRequire(import.meta.url);
    return require("ffmpeg-static");
  } catch {
    // not installed in this context
  }

  return findSystemBinary("ffmpeg");
}

// ---------------------------------------------------------------------------
// yt-dlp args
// ---------------------------------------------------------------------------

export function buildYtDlpArgs({ url, format = "video", quality = "best", allowPlaylist = false }) {
  const args = [
    "--newline",
    "--no-check-certificates",
    "--user-agent",
    USER_AGENT,
    "--extractor-args",
    "youtube:player_client=web,default;skip=hls,dash",
  ];

  if (!allowPlaylist) {
    args.push("--no-playlist");
  }

  if (format === "audio") {
    const q = quality || "320k";
    args.push("-x", "--audio-format", "mp3", "--audio-quality", q.toUpperCase());
  } else {
    const q = quality || "best";
    if (q === "2160p") {
      args.push("-f", "bestvideo[height<=2160]+bestaudio/best[height<=2160]");
    } else if (q === "1080p") {
      args.push("-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]");
    } else if (q === "720p") {
      args.push("-f", "bestvideo[height<=720]+bestaudio/best[height<=720]");
    } else if (q === "480p") {
      args.push("-f", "bestvideo[height<=480]+bestaudio/best[height<=480]");
    } else {
      args.push("-f", "best");
    }
  }

  return args;
}

// ---------------------------------------------------------------------------
// Save location
// ---------------------------------------------------------------------------

// Existing directory / trailing slash / extensionless basename → directory.
// Otherwise → file path; final extension is chosen by yt-dlp.
export function parseSaveLocation(saveLocation) {
  let cwd = process.cwd();
  let outputTemplate = "%(title)s.%(ext)s";

  if (saveLocation) {
    const p = path.resolve(saveLocation);
    const looksLikeDir =
      (fs.existsSync(p) && fs.statSync(p).isDirectory()) ||
      p.endsWith(path.sep) ||
      p.endsWith("/") ||
      !path.extname(path.basename(p));

    if (looksLikeDir) {
      fs.mkdirSync(p, { recursive: true });
      cwd = p;
    } else {
      const dir = path.dirname(p);
      const stem = path.basename(p, path.extname(p));
      fs.mkdirSync(dir, { recursive: true });
      outputTemplate = path.join(dir, `${stem}.%(ext)s`);
      cwd = dir;
    }
  }

  return { cwd, outputTemplate };
}

function parseOutputFile(log, cwd) {
  let name = null;
  for (const line of log.split("\n")) {
    let m = line.match(/Destination:\s+(.+)/);
    if (m) name = m[1].trim();
    m = line.match(/Merging formats into\s+"(.+)"/);
    if (m) name = m[1];
  }
  if (name) {
    return path.join(cwd, name.split(/[\\/]/).pop());
  }
  // Fallback: newest regular file in the output directory.
  let newest = null;
  let newestTime = 0;
  for (const entry of fs.readdirSync(cwd)) {
    const abs = path.join(cwd, entry);
    try {
      const st = fs.statSync(abs);
      if (st.isFile() && st.mtimeMs > newestTime) {
        newest = abs;
        newestTime = st.mtimeMs;
      }
    } catch {
      // ignore
    }
  }
  return newest;
}

// ---------------------------------------------------------------------------
// Playlist support
// ---------------------------------------------------------------------------

// List playlist videos with metadata (no downloads). Resolves with { exitCode, playlist }.
export async function listPlaylist(url, timeoutMs = 120_000) {
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
    "--flat-playlist",
    "--playlist-items",
    "1:500", // up to 500 videos
    url,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(ytDlp, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      try { process.kill(-child.pid, "SIGKILL"); } catch {}
      resolve({ exitCode: 1, playlist: null, error: `Playlist fetch timed out after ${timeoutMs / 1000}s` });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return resolve({ exitCode: code, playlist: null, error: stderr });
      }

      const videos = [];
      let playlistTitle = null;

      for (const line of stdout.trim().split("\n").filter(Boolean)) {
        try {
          const info = JSON.parse(line);
          if (info._type === "playlist") {
            playlistTitle = info.title;
          } else {
            videos.push({
              index: info.playlist_index || videos.length + 1,
              id: info.id,
              title: info.title,
              channel: info.channel || info.uploader,
              duration_seconds: info.duration,
              url: info.webpage_url || `https://www.youtube.com/watch?v=${info.id}`,
            });
          }
        } catch { /* skip malformed lines */ }
      }

      resolve({
        exitCode: 0,
        playlist: {
          title: playlistTitle || videos[0]?.title || "Unknown Playlist",
          video_count: videos.length,
          total_duration_seconds: videos.reduce((sum, v) => sum + (v.duration_seconds || 0), 0),
          videos,
        },
      });
    });
  });
}

// Download all videos in a playlist. Returns list of { title, file, url }.
export async function downloadPlaylist({ url, format = "video", quality = "best", saveLocation, onProgress }) {
  const ytDlp = await getYtDlpPath();
  const ffmpeg = resolveFfmpegPath();

  const args = buildYtDlpArgs({ url, format, quality, allowPlaylist: true });
  if (ffmpeg) {
    args.unshift("--ffmpeg-location", path.dirname(ffmpeg));
  }

  const { cwd, outputTemplate } = parseSaveLocation(saveLocation);
  // For playlists, use a subdirectory based on playlist title
  args.push("-o", outputTemplate, "--yes-playlist", url);

  return new Promise((resolve, reject) => {
    const child = spawn(ytDlp, args, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

    let log = "";
    const downloaded = [];
    let currentVideo = null;

    const onData = (chunk) => {
      const text = chunk.toString();
      log += text;

      // Detect download starts to track current video
      const videoMatch = text.match(/\[download\]\s+Downloading item\s+(\d+)/);
      if (videoMatch) {
        currentVideo = { index: parseInt(videoMatch[1]), title: null, file: null };
      }

      // Extract title from download info
      const titleMatch = text.match(/\[download\]\s+(?:Destination|Downloading)\s+(.+)/);
      if (titleMatch && currentVideo) {
        currentVideo.title = path.basename(titleMatch[1].trim(), path.extname(titleMatch[1]));
        currentVideo.file = titleMatch[1].trim();
      }

      // Detect video completion
      const destMatch = text.match(/\[download\]\s+(.+?)\s+has already been downloaded/);
      const completeMatch = text.match(/\[download\]\s+100%\s+of\s+.+? in\s+/);
      if ((destMatch || completeMatch) && currentVideo) {
        downloaded.push({
          index: currentVideo.index,
          title: currentVideo.title || `Video ${currentVideo.index}`,
          file: currentVideo.file || null,
        });
        currentVideo = null;
      }

      if (onProgress) onProgress(text);
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve({ dir: cwd, downloaded, count: downloaded.length, log });
      } else {
        reject(
          new Error(
            `yt-dlp exited with code ${code}\n${log.trim().split("\n").slice(-5).join("\n")}`
          )
        );
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

// Runs a yt-dlp download. Resolves with { file, dir, log } on success.
export async function download({ url, format = "video", quality = "best", saveLocation, onProgress }) {
  const ytDlp = await getYtDlpPath();
  const ffmpeg = resolveFfmpegPath();

  const args = buildYtDlpArgs({ url, format, quality });
  if (ffmpeg) {
    args.unshift("--ffmpeg-location", path.dirname(ffmpeg));
  }

  const { cwd, outputTemplate } = parseSaveLocation(saveLocation);
  args.push("-o", outputTemplate, url);

  return new Promise((resolve, reject) => {
    const child = spawn(ytDlp, args, { cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

    let log = "";
    const onData = (chunk) => {
      const text = chunk.toString();
      log += text;
      if (onProgress) onProgress(text);
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        const file = parseOutputFile(log, cwd);
        resolve({ file, dir: cwd, log });
      } else {
        reject(
          new Error(
            `yt-dlp exited with code ${code}\n${log.trim().split("\n").slice(-5).join("\n")}`
          )
        );
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Video info
// ---------------------------------------------------------------------------

// Runs `yt-dlp --dump-json` for a URL. Resolves with raw { exitCode, stdout, stderr }.
export async function fetchVideoInfo(url, timeoutMs = 90_000) {
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
    const child = spawn(ytDlp, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

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
