import { NextRequest, NextResponse } from "next/server";
import { Sandbox } from "@vercel/sandbox";
import { USER_AGENT, YT_DLP_BIN, ensureYtDlp, shQuote } from "@/lib/sandbox-ytdlp";

// Allow enough time to spin up a sandbox, install yt-dlp, and fetch metadata.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let sandbox: Sandbox | null = null;

  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    try {
      new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    // Short-lived sandbox just to run `yt-dlp --dump-json` and shut down.
    sandbox = await Sandbox.create({ timeout: 60_000 });

    await ensureYtDlp(sandbox);

    const cmd = [
      YT_DLP_BIN,
      "--dump-json",
      "--no-download",
      "--no-warnings",
      "--no-check-certificates",
      "--user-agent",
      shQuote(USER_AGENT),
      "--extractor-args",
      shQuote("youtube:player_client=web,default;skip=hls,dash"),
      "--no-playlist",
      shQuote(url),
    ].join(" ");

    const result = await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", cmd],
    });

    const stdout = await result.stdout();

    if (result.exitCode !== 0 || !stdout) {
      const stderr = await result.stderr();
      console.error("[v0] yt-dlp stderr:", stderr);
      return NextResponse.json(
        { error: "Failed to fetch video info" },
        { status: 500 }
      );
    }

    const info = JSON.parse(stdout);

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
        .filter(
          (f: { vcodec?: string; acodec?: string; format_note?: string }) =>
            f.vcodec !== "none" || f.acodec !== "none"
        )
        .map(
          (f: {
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
          })
        )
        .slice(0, 20),
    };

    return NextResponse.json(videoInfo);
  } catch (error) {
    console.error("[v0] Error fetching video info:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to fetch video info: ${message}` },
      { status: 500 }
    );
  } finally {
    if (sandbox) {
      await sandbox.stop().catch((err) => console.error("[v0] Failed to stop sandbox:", err));
    }
  }
}
