#!/usr/bin/env node
// GitTube MCP server — lets AI agents search, discover, and download
// videos/audio from 1000+ sites with yt-dlp.
//
// Tools:
//   search           search YouTube for videos by query
//   video_info       fetch metadata for a URL (title, duration, uploader, …)
//   download_video   download a video (quality: best/2160p/1080p/720p/480p)
//   download_audio   extract audio as MP3 (quality: 320k/192k/128k)
//
// Register with clients, e.g.:
//   "mcpServers": {
//     "gittube": { "command": "node", "args": ["/path/to/mcp/server.mjs"] }
//   }

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { download, fetchVideoInfo, getYtDlpPath, USER_AGENT, listPlaylist, downloadPlaylist } from "../scripts/gittube-lib.mjs";

const VIDEO_QUALITIES = ["best", "480p", "720p", "1080p", "2160p"];
const AUDIO_QUALITIES = ["320k", "192k", "128k"];

const server = new McpServer({ name: "gittube", version: "1.0.0" });

// ---------------------------------------------------------------------------
// search
// ---------------------------------------------------------------------------

// Runs yt-dlp with `ytsearchN:<query>` and returns parsed results.
async function ytDlpSearch(query, maxResults = 10, timeoutMs = 60_000) {
  const ytDlp = await getYtDlpPath();
  const searchQuery = `ytsearch${maxResults}:${query}`;
  const args = [
    "--dump-json",
    "--no-download",
    "--no-warnings",
    "--no-check-certificates",
    "--user-agent",
    USER_AGENT,
    "--flat-playlist",
    "--playlist-items", `1:${maxResults}`,
    searchQuery,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(ytDlp, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      try { process.kill(-child.pid, "SIGKILL"); } catch {}
      resolve({ exitCode: 1, results: [], error: `Search timed out after ${timeoutMs / 1000}s` });
    }, timeoutMs);

    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return resolve({ exitCode: code, results: [], error: stderr || `yt-dlp exited with code ${code}` });
      }
      // yt-dlp outputs one JSON object per line for playlist/flat-playlist mode.
      // For ytsearch it outputs a single JSON object per result.
      const results = stdout
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try {
            const info = JSON.parse(line);
            return {
              id: info.id,
              title: info.title,
              channel: info.channel || info.uploader,
              duration_seconds: info.duration,
              url: info.webpage_url || `https://www.youtube.com/watch?v=${info.id}`,
              thumbnail: info.thumbnails?.[0]?.url || info.thumbnail,
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean);
      resolve({ exitCode: 0, results });
    });
  });
}

server.tool(
  "search",
  "Search YouTube for videos matching a query. Returns top 10 results with title, channel, duration, and URL.",
  {
    query: z.string().describe("Search query (e.g. 'how to make sourdough bread')"),
    maxResults: z.number().min(1).max(20).default(10).describe("Number of results (1-20, default 10)"),
  },
  async ({ query, maxResults }) => {
    try {
      const { exitCode, results, error } = await ytDlpSearch(query, maxResults);
      if (exitCode !== 0 || results.length === 0) {
        return {
          content: [{ type: "text", text: `No results found for "${query}".${error ? ` Error: ${error}` : ""}` }],
          isError: exitCode !== 0,
        };
      }
      const formatted = results.map((r, i) =>
        `${i + 1}. **${r.title}**\n   Channel: ${r.channel || "unknown"}\n   Duration: ${r.duration_seconds ? `${Math.floor(r.duration_seconds / 60)}m ${r.duration_seconds % 60}s` : "unknown"}\n   URL: ${r.url}`
      ).join("\n\n");
      return { content: [{ type: "text", text: `Found ${results.length} results for "${query}":\n\n${formatted}` }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Search failed: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// list_playlist
// ---------------------------------------------------------------------------

server.tool(
  "list_playlist",
  "List all videos in a YouTube playlist with title, channel, duration, and URL. No downloads.",
  {
    url: z.string().url().describe("YouTube playlist URL"),
  },
  async ({ url }) => {
    try {
      const { exitCode, playlist, error } = await listPlaylist(url);
      if (exitCode !== 0 || !playlist) {
        return {
          content: [{ type: "text", text: `Failed to list playlist: ${error || "Unknown error"}` }],
          isError: true,
        };
      }
      const summary = [
        `**${playlist.title}**`,
        `Total videos: ${playlist.video_count}`,
        `Total duration: ${Math.floor(playlist.total_duration_seconds / 3600)}h ${Math.floor((playlist.total_duration_seconds % 3600) / 60)}m`,
        "",
        "Videos:",
        "",
      ];
      for (const v of playlist.videos) {
        const dur = v.duration_seconds
          ? `${Math.floor(v.duration_seconds / 60)}m ${v.duration_seconds % 60}s`
          : "?";
        summary.push(`${v.index}. **${v.title}** — ${v.channel || "unknown"} — ${dur}`);
        summary.push(`   ${v.url}`);
        summary.push("");
      }
      return { content: [{ type: "text", text: summary.join("\n") }] };
    } catch (err) {
      return { content: [{ type: "text", text: `List playlist failed: ${err.message}` }], isError: true };
    }
  }
);

// ---------------------------------------------------------------------------
// download_playlist
// ---------------------------------------------------------------------------

server.tool(
  "download_playlist",
  "Download all videos in a YouTube playlist. Returns count and directory.",
  {
    url: z.string().url().describe("YouTube playlist URL"),
    format: z.enum(["video", "audio"]).default("video").describe("video = MP4, audio = MP3"),
    quality: z.string().describe("Video: best/2160p/1080p/720p/480p  Audio: 320k/192k/128k"),
    saveLocation: z.string().optional().describe("Directory or file path. Defaults to current directory."),
  },
  async ({ url, format, quality, saveLocation }) => {
    try {
      const result = await downloadPlaylist({ url, format, quality, saveLocation });
      const summary = [
        `Downloaded ${result.count} videos to ${result.dir}`,
        "",
        "Files:",
        result.downloaded.map((v) => `  ${v.index}. ${v.title}`).join("\n"),
      ].join("\n");
      return { content: [{ type: "text", text: summary }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Playlist download failed: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "video_info",
  "Fetch metadata for a video URL: title, uploader, duration, views, thumbnail, and available formats.",
  {
    url: z.string().url(),
  },
  async ({ url }) => {
    try {
      const { exitCode, stdout, stderr } = await fetchVideoInfo(url);
      if (exitCode !== 0 || !stdout) {
        return { content: [{ type: "text", text: `Failed to fetch video info:\n${stderr}` }], isError: true };
      }
      const info = JSON.parse(stdout);
      const summary = {
        id: info.id,
        title: info.title,
        uploader: info.uploader || info.channel,
        duration_seconds: info.duration,
        upload_date: info.upload_date,
        view_count: info.view_count,
        like_count: info.like_count,
        thumbnail: info.thumbnail,
        webpage_url: info.webpage_url,
        extractor: info.extractor,
        description: info.description?.slice(0, 500) ?? "",
      };
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

async function runDownload({ url, format, quality, saveDir }) {
  const saveLocation = saveDir || path.join(os.homedir(), "Downloads");
  try {
    const result = await download({ url, format, quality, saveLocation });
    return {
      content: [
        {
          type: "text",
          text: `Download complete.\nFile: ${result.file}\nDirectory: ${result.dir}`,
        },
      ],
    };
  } catch (err) {
    return { content: [{ type: "text", text: `Download failed: ${err.message}` }], isError: true };
  }
}

server.tool(
  "download_video",
  "Download a video. Quality options: best, 2160p, 1080p, 720p, 480p. Saves to saveDir (default: ~/Downloads). Returns the file path.",
  {
    url: z.string().url(),
    quality: z.enum(VIDEO_QUALITIES).default("best").describe("Video quality"),
    saveDir: z.string().optional().describe("Directory to save into (default: ~/Downloads)"),
  },
  ({ url, quality, saveDir }) => runDownload({ url, format: "video", quality, saveDir })
);

server.tool(
  "download_audio",
  "Download a video's audio as MP3. Quality options: 320k, 192k, 128k. Saves to saveDir (default: ~/Downloads). Returns the file path.",
  {
    url: z.string().url(),
    quality: z.enum(AUDIO_QUALITIES).default("320k").describe("Audio bitrate"),
    saveDir: z.string().optional().describe("Directory to save into (default: ~/Downloads)"),
  },
  ({ url, quality, saveDir }) => runDownload({ url, format: "audio", quality, saveDir })
);

const transport = new StdioServerTransport();
await server.connect(transport);
