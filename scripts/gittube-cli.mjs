#!/usr/bin/env node
// GitTube CLI — download video or audio from 1000+ sites with yt-dlp.
//
// Usage:
//   gittube -v [<quality>] <url> [save-location]
//   gittube -a [<quality>] <url> [save-location]
//
// Examples:
//   gittube -v https://youtu.be/abc123
//   gittube -v 1080p https://youtu.be/abc123 ~/Movies
//   gittube -a 128k https://youtu.be/abc123 ~/Music/song.mp3
//
// save-location is either a directory or a file path. When omitted, files are
// saved to the current directory.

import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const VIDEO_QUALITIES = ["best", "480p", "720p", "1080p", "2160p"];
const AUDIO_QUALITIES = ["128k", "192k", "320k"];

function usage() {
  console.error(`GitTube — download videos and audio from 1000+ sites.

Usage:
  gittube -v [quality] <url> [save-location]   download video
  gittube -a [quality] <url> [save-location]   extract audio (MP3)

Options:
  -v, --video    download the best available video
  -a, --audio    extract audio as MP3
  -h, --help     show this help

Qualities:
  video:  best, 2160p, 1080p, 720p, 480p   (default: best)
  audio:  320k, 192k, 128k                 (default: 320k)

save-location may be a directory or a full file path. Defaults to the current
directory. The final extension is chosen automatically.

Examples:
  gittube -v https://youtu.be/abc123
  gittube -v 1080p https://youtu.be/abc123 ~/Movies
  gittube -a 128k https://youtu.be/abc123 ~/Music/song.mp3`);
}

function parseArgs(argv) {
  const opts = { format: null, quality: null, url: null, saveLocation: null, help: false };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      opts.help = true;
    } else if (a === "-v" || a === "--video") {
      opts.format = "video";
    } else if (a === "-a" || a === "--audio") {
      opts.format = "audio";
    } else if (a.startsWith("-")) {
      console.error(`Unknown option: ${a}`);
      usage();
      process.exit(1);
    } else {
      positional.push(a);
    }
  }

  opts.url = positional[0] ?? null;
  opts.saveLocation = positional[1] ?? null;

  // Quality is a positional here (keeps it "simple"), so pick it from the
  // first positional only when it looks like a known quality token.
  if (opts.format === "audio" && AUDIO_QUALITIES.includes(positional[0])) {
    opts.quality = positional[0];
    opts.url = positional[1] ?? null;
    opts.saveLocation = positional[2] ?? null;
  } else if (opts.format === "video" && VIDEO_QUALITIES.includes(positional[0])) {
    opts.quality = positional[0];
    opts.url = positional[1] ?? null;
    opts.saveLocation = positional[2] ?? null;
  }

  return opts;
}

// ---------------------------------------------------------------------------
// yt-dlp / ffmpeg binary resolution (mirrors lib/downloader.ts)
// ---------------------------------------------------------------------------

function ytDlpAssetName() {
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
  console.error(`[gittube] downloading yt-dlp…`);
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

async function getYtDlpPath() {
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

function findSystemBinary(name) {
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

function resolveFfmpegPath() {
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
// Download
// ---------------------------------------------------------------------------

function buildArgs({ url, format, quality }) {
  const args = [
    "--newline",
    "--no-check-certificates",
    "--user-agent",
    USER_AGENT,
    "--extractor-args",
    "youtube:player_client=web,default;skip=hls,dash",
    "--no-playlist",
  ];

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

async function run(opts) {
  const ytDlp = await getYtDlpPath();
  const ffmpeg = resolveFfmpegPath();

  const args = buildArgs(opts);
  if (ffmpeg) {
    args.unshift("--ffmpeg-location", path.dirname(ffmpeg));
  }

  // Resolve save location: existing directory / trailing slash / extensionless
  // basename → treated as a directory; otherwise as a file path.
  let cwd = process.cwd();
  let outputTemplate = "%(title)s.%(ext)s";

  if (opts.saveLocation) {
    const p = path.resolve(opts.saveLocation);
    const looksLikeDir =
      fs.existsSync(p) && fs.statSync(p).isDirectory() ||
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

  args.push("-o", outputTemplate, opts.url);

  console.error(`[gittube] downloading (${opts.format}, ${opts.quality || "best"}) → ${cwd}`);
  const child = spawn(ytDlp, args, { cwd, stdio: "inherit", windowsHide: true });

  child.on("error", (err) => {
    console.error(`[gittube] failed to start yt-dlp: ${err.message}`);
    process.exit(1);
  });

  child.on("exit", (code) => {
    if (code === 0) {
      console.error(`[gittube] done ✓`);
    }
    process.exit(code ?? 1);
  });
}

const opts = parseArgs(process.argv.slice(2));

if (opts.help) {
  usage();
  process.exit(0);
}
if (!opts.format) {
  console.error("Error: specify -v (video) or -a (audio)");
  usage();
  process.exit(1);
}
if (!opts.url) {
  console.error("Error: a URL is required");
  usage();
  process.exit(1);
}
if (opts.format === "video" && opts.quality && !VIDEO_QUALITIES.includes(opts.quality)) {
  console.error(`Error: unknown video quality "${opts.quality}" (${VIDEO_QUALITIES.join(", ")})`);
  process.exit(1);
}
if (opts.format === "audio" && opts.quality && !AUDIO_QUALITIES.includes(opts.quality)) {
  console.error(`Error: unknown audio quality "${opts.quality}" (${AUDIO_QUALITIES.join(", ")})`);
  process.exit(1);
}

run(opts).catch((err) => {
  console.error(`[gittube] ${err.message}`);
  process.exit(1);
});
