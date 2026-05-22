import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const YT_DLP_PATH = process.env.YT_DLP_PATH || "/home/vercel-sandbox/.local/bin/yt-dlp";

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    // Get video info using yt-dlp
    const { stdout, stderr } = await execAsync(
      `${YT_DLP_PATH} --dump-json --no-download --no-warnings "${url}"`,
      { timeout: 30000 }
    );

    if (stderr && !stdout) {
      console.error("[v0] yt-dlp stderr:", stderr);
      return NextResponse.json(
        { error: "Failed to fetch video info" },
        { status: 500 }
      );
    }

    const info = JSON.parse(stdout);

    // Extract relevant info
    const videoInfo = {
      id: info.id,
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration,
      uploader: info.uploader || info.channel,
      uploadDate: info.upload_date,
      viewCount: info.view_count,
      likeCount: info.like_count,
      description: info.description?.slice(0, 500),
      webpage_url: info.webpage_url,
      extractor: info.extractor,
      formats: (info.formats || [])
        .filter((f: { vcodec?: string; acodec?: string; format_note?: string }) => 
          f.vcodec !== "none" || f.acodec !== "none"
        )
        .map((f: { 
          format_id: string; 
          ext: string; 
          format_note?: string; 
          height?: number; 
          width?: number;
          filesize?: number;
          filesize_approx?: number;
          vcodec?: string;
          acodec?: string;
          tbr?: number;
        }) => ({
          format_id: f.format_id,
          ext: f.ext,
          quality: f.format_note || `${f.height}p` || "unknown",
          height: f.height,
          width: f.width,
          filesize: f.filesize || f.filesize_approx,
          hasVideo: f.vcodec !== "none",
          hasAudio: f.acodec !== "none",
          tbr: f.tbr,
        }))
        .slice(0, 20), // Limit formats for UI
    };

    return NextResponse.json(videoInfo);
  } catch (error) {
    console.error("[v0] Error fetching video info:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch video info: ${message}` },
      { status: 500 }
    );
  }
}
