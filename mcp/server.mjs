#!/usr/bin/env node
// GitTube MCP server — lets AI agents download videos/audio with yt-dlp.
//
// Tools:
//   video_info     fetch metadata for a URL (title, duration, uploader, …)
//   download_video download a video (quality: best/2160p/1080p/720p/480p)
//   download_audio extract audio as MP3 (quality: 320k/192k/128k)
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
import { download, fetchVideoInfo } from "../scripts/gittube-lib.mjs";

const VIDEO_QUALITIES = ["best", "480p", "720p", "1080p", "2160p"];
const AUDIO_QUALITIES = ["320k", "192k", "128k"];

const server = new McpServer({ name: "gittube", version: "1.0.0" });

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
