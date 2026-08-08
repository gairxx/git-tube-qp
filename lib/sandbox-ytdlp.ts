import type { Sandbox } from "@vercel/sandbox";

// Directory inside the sandbox (relative to /vercel/sandbox) where yt-dlp writes files.
export const DOWNLOADS_DIR = "downloads";
export const YT_DLP_BIN = "/vercel/sandbox/.bin/yt-dlp";
export const PROGRESS_LOG = "progress.log";
export const DONE_FLAG = "done.flag";

// User agent to bypass basic bot detection.
export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/**
 * Validate that a string is safe to use as a Vercel Sandbox name.
 * Sandbox names must be lowercase letters, digits, hyphens, or underscores.
 */
export function generateDownloadId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `dl-${time}-${rand}`.slice(0, 32);
}

/**
 * Quote a single argument for safe use inside a `sh -c "..."` string.
 */
export function shQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Downloads the standalone yt-dlp binary into the sandbox if it isn't already present.
 * The standalone Linux build has no Python dependency, so it starts fast and reliably.
 */
export async function ensureYtDlp(sandbox: Sandbox) {
  await sandbox.mkDir(".bin");
  const check = await sandbox.runCommand("test", ["-x", YT_DLP_BIN]);
  if (check.exitCode === 0) return;

  const install = await sandbox.runCommand({
    cmd: "sh",
    args: [
      "-c",
      `curl -sL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux -o ${YT_DLP_BIN} && chmod +x ${YT_DLP_BIN}`,
    ],
  });

  if (install.exitCode !== 0) {
    const stderr = await install.stderr();
    throw new Error(`Failed to install yt-dlp: ${stderr || "unknown error"}`);
  }
}

/**
 * Ensures ffmpeg is available in the sandbox for merging separate video/audio
 * streams and extracting audio. Many base images already ship with ffmpeg,
 * so we check first before paying the apt-get install cost.
 */
export async function ensureFfmpeg(sandbox: Sandbox) {
  const check = await sandbox.runCommand("sh", ["-c", "command -v ffmpeg"]);
  if (check.exitCode === 0) return;

  const install = await sandbox.runCommand({
    cmd: "sh",
    args: [
      "-c",
      "apt-get update -qq && apt-get install -y -qq --no-install-recommends ffmpeg",
    ],
    sudo: true,
  });

  if (install.exitCode !== 0) {
    const stderr = await install.stderr();
    throw new Error(`Failed to install ffmpeg: ${stderr || "unknown error"}`);
  }
}

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
    `${DOWNLOADS_DIR}/%(title)s.%(ext)s`,
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
    result.filename = filenameMatches[filenameMatches.length - 1][1].trim().split("/").pop();
  }

  return result;
}

export function contentTypeForExt(ext: string): string {
  const map: Record<string, string> = {
    mp4: "video/mp4",
    webm: "video/webm",
    mkv: "video/x-matroska",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    opus: "audio/opus",
  };
  return map[ext.toLowerCase()] || "application/octet-stream";
}
