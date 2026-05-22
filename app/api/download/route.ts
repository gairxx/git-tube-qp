import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { mkdir } from "fs/promises";
import path from "path";

const YT_DLP_PATH = process.env.YT_DLP_PATH || "/home/vercel-sandbox/.local/bin/yt-dlp";
const DOWNLOADS_DIR = process.env.DOWNLOADS_DIR || "/tmp/downloads";

// User agent to bypass bot detection
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// Store active downloads
const activeDownloads = new Map<string, {
  progress: number;
  status: "downloading" | "completed" | "error" | "cancelled";
  filename?: string;
  error?: string;
  speed?: string;
  eta?: string;
}>();

export async function POST(request: NextRequest) {
  try {
    const { url, format, quality } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Create downloads directory
    await mkdir(DOWNLOADS_DIR, { recursive: true });

    // Generate download ID
    const downloadId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // Initialize download tracking
    activeDownloads.set(downloadId, {
      progress: 0,
      status: "downloading",
    });

    // Build yt-dlp command arguments with anti-bot flags
    const args: string[] = [
      "--newline", // Output progress on new lines
      "-o", path.join(DOWNLOADS_DIR, "%(title)s.%(ext)s"),
      "--no-check-certificates",
      "--user-agent", USER_AGENT,
      "--extractor-args", "youtube:player_client=web,default;skip=hls,dash",
      "--no-playlist",
    ];

    // Add format options
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
      // Video format
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

    // Spawn yt-dlp process
    const ytdlp = spawn(YT_DLP_PATH, args);

    ytdlp.stdout.on("data", (data) => {
      const output = data.toString();
      console.log("[v0] yt-dlp output:", output);

      // Parse progress
      const progressMatch = output.match(/(\d+\.?\d*)%/);
      if (progressMatch) {
        const progress = parseFloat(progressMatch[1]);
        const current = activeDownloads.get(downloadId);
        if (current) {
          current.progress = progress;
          
          // Parse speed
          const speedMatch = output.match(/(\d+\.?\d*\s*[KMG]?i?B\/s)/);
          if (speedMatch) {
            current.speed = speedMatch[1];
          }
          
          // Parse ETA
          const etaMatch = output.match(/ETA\s+(\d+:\d+)/);
          if (etaMatch) {
            current.eta = etaMatch[1];
          }
        }
      }

      // Parse filename
      const filenameMatch = output.match(/Destination:\s+(.+)/);
      if (filenameMatch) {
        const current = activeDownloads.get(downloadId);
        if (current) {
          current.filename = path.basename(filenameMatch[1]);
        }
      }
    });

    ytdlp.stderr.on("data", (data) => {
      console.error("[v0] yt-dlp stderr:", data.toString());
    });

    ytdlp.on("close", (code) => {
      const current = activeDownloads.get(downloadId);
      if (current) {
        if (code === 0) {
          current.status = "completed";
          current.progress = 100;
        } else {
          current.status = "error";
          current.error = `Process exited with code ${code}`;
        }
      }
    });

    ytdlp.on("error", (error) => {
      console.error("[v0] yt-dlp error:", error);
      const current = activeDownloads.get(downloadId);
      if (current) {
        current.status = "error";
        current.error = error.message;
      }
    });

    return NextResponse.json({ 
      downloadId,
      message: "Download started" 
    });
  } catch (error) {
    console.error("[v0] Error starting download:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to start download: ${message}` },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const downloadId = request.nextUrl.searchParams.get("id");
  
  if (!downloadId) {
    // Return all active downloads
    const downloads = Object.fromEntries(activeDownloads);
    return NextResponse.json(downloads);
  }

  const download = activeDownloads.get(downloadId);
  if (!download) {
    return NextResponse.json({ error: "Download not found" }, { status: 404 });
  }

  return NextResponse.json(download);
}

export async function DELETE(request: NextRequest) {
  const downloadId = request.nextUrl.searchParams.get("id");
  
  if (!downloadId) {
    return NextResponse.json({ error: "Download ID is required" }, { status: 400 });
  }

  activeDownloads.delete(downloadId);
  return NextResponse.json({ message: "Download removed" });
}
