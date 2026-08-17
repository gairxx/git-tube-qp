#!/usr/bin/env node
// GitTube CLI — download video or audio from 1000+ sites with yt-dlp.
//
// Usage:
//   gittube -v [<quality>] <url> [save-location]
//   gittube -a [<quality>] <url> [save-location]
//   gittube --playlist -v [<quality>] <url> [save-location]
//   gittube --list-playlist <url>
//   gittube --search <query>
//
// Examples:
//   gittube -v https://youtu.be/abc123
//   gittube -v 1080p https://youtu.be/abc123 ~/Movies
//   gittube -a 128k https://youtu.be/abc123 ~/Music/song.mp3
//   gittube --playlist -v https://youtube.com/playlist?list=PLxxx
//   gittube --list-playlist https://youtube.com/playlist?list=PLxxx
//   gittube --search "lofi hip hop beats"
//
// save-location is either a directory or a file path. When omitted, files are
// saved to the current directory.

import { download, downloadPlaylist, listPlaylist } from "./gittube-lib.mjs";

const VIDEO_QUALITIES = ["best", "480p", "720p", "1080p", "2160p"];
const AUDIO_QUALITIES = ["128k", "192k", "320k"];

function usage() {
  console.error(`GitTube — download videos and audio from 1000+ sites.

Usage:
  gittube -v [quality] <url> [save-location]           download video
  gittube -a [quality] <url> [save-location]           extract audio (MP3)
  gittube --playlist -v [quality] <url> [save-location]  download playlist
  gittube --list-playlist <url>                         list playlist videos
  gittube --search <query>                              search YouTube

Options:
  -v, --video         download the best available video
  -a, --audio         extract audio as MP3
  --playlist          download all videos in a playlist
  --list-playlist     list playlist videos (no download)
  --search <query>    search YouTube for videos
  -h, --help          show this help

Qualities:
  video:  best, 2160p, 1080p, 720p, 480p   (default: best)
  audio:  320k, 192k, 128k                 (default: 320k)

save-location may be a directory or a full file path. Defaults to the current
directory. The final extension is chosen automatically.

Examples:
  gittube -v https://youtu.be/abc123
  gittube -v 1080p https://youtu.be/abc123 ~/Movies
  gittube -a 128k https://youtu.be/abc123 ~/Music/song.mp3
  gittube --playlist -v 1080p https://youtube.com/playlist?list=PLxxx ~/Videos
  gittube --list-playlist https://youtube.com/playlist?list=PLxxx
  gittube --search "react hooks tutorial"`);
}

function parseArgs(argv) {
  const opts = {
    format: null,
    quality: null,
    url: null,
    saveLocation: null,
    help: false,
    playlist: false,
    listPlaylist: false,
    search: null,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") {
      opts.help = true;
    } else if (a === "-v" || a === "--video") {
      opts.format = "video";
    } else if (a === "-a" || a === "--audio") {
      opts.format = "audio";
    } else if (a === "--playlist") {
      opts.playlist = true;
    } else if (a === "--list-playlist") {
      opts.listPlaylist = true;
    } else if (a === "--search") {
      opts.search = argv[++i] ?? null;
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
  if (opts.search) {
    console.error(`[gittube] searching YouTube: "${opts.search}"`);
    const { spawn } = await import("node:child_process");
    const readline = await import("node:readline");
    const { getYtDlpPath } = await import("./gittube-lib.mjs");
    const ytDlp = await getYtDlpPath();
    const child = spawn(ytDlp, [
      "--dump-json", "--no-download", "--no-warnings",
      "--flat-playlist", "--playlist-items", "1:10",
      `ytsearch10:${opts.search}`,
    ], { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });

    let stdout = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.on("close", (code) => {
      if (code !== 0) {
        console.error(`[gittube] search failed`);
        process.exit(1);
      }
      const results = stdout.trim().split("\n").filter(Boolean).map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);
      console.log(`\nFound ${results.length} results for "${opts.search}":\n`);
      results.forEach((r, i) => {
        const dur = r.duration ? `${Math.floor(r.duration / 60)}m ${r.duration % 60}s` : "?";
        console.log(`${i + 1}. ${r.title}`);
        console.log(`   Channel: ${r.channel || r.uploader || "?"}`);
        console.log(`   Duration: ${dur}`);
        console.log(`   URL: ${r.webpage_url || `https://www.youtube.com/watch?v=${r.id}`}`);
        console.log("");
      });
    });
    return;
  }

  if (opts.listPlaylist) {
    console.error(`[gittube] listing playlist: ${opts.url}`);
    const { exitCode, playlist, error } = await listPlaylist(opts.url);
    if (exitCode !== 0 || !playlist) {
      console.error(`[gittube] failed: ${error}`);
      process.exit(1);
    }
    console.log(`\n${playlist.title}`);
    console.log(`Total videos: ${playlist.video_count}`);
    console.log(`Duration: ${Math.floor(playlist.total_duration_seconds / 3600)}h ${Math.floor((playlist.total_duration_seconds % 3600) / 60)}m\n`);
    for (const v of playlist.videos) {
      const dur = v.duration_seconds ? `${Math.floor(v.duration_seconds / 60)}m ${v.duration_seconds % 60}s` : "?";
      console.log(`${v.index}. ${v.title} — ${v.channel || "?"} — ${dur}`);
      console.log(`   ${v.url}`);
    }
    return;
  }

  if (opts.playlist) {
    console.error(`[gittube] downloading playlist (${opts.format}, ${opts.quality || "best"}) → ${opts.saveLocation || process.cwd()}`);
    const result = await downloadPlaylist({
      url: opts.url,
      format: opts.format,
      quality: opts.quality,
      saveLocation: opts.saveLocation,
      onProgress: (text) => process.stderr.write(text),
    });
    console.error(`[gittube] done ✓  ${result.count} videos downloaded to ${result.dir}`);
    return;
  }

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

if (opts.search) {
  // search mode, no format/url needed
} else if (opts.listPlaylist) {
  if (!opts.url) {
    console.error("Error: a URL is required for --list-playlist");
    process.exit(1);
  }
} else if (!opts.format) {
  console.error("Error: specify -v (video) or -a (audio)");
  usage();
  process.exit(1);
} else if (!opts.url) {
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
