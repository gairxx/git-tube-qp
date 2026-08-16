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

import { download } from "./gittube-lib.mjs";

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

async function run(opts) {
  console.error(`[gittube] downloading (${opts.format}, ${opts.quality || "best"}) → ${opts.saveLocation || process.cwd()}`);
  const result = await download({
    url: opts.url,
    format: opts.format,
    quality: opts.quality,
    saveLocation: opts.saveLocation,
    onProgress: (text) => process.stderr.write(text),
  });
  console.error(`[gittube] done ✓  ${result.file}`);
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
