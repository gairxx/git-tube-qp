import { NextRequest, NextResponse } from "next/server";
import { getDownloadStatus, startDownload, stopDownload } from "@/lib/downloader";

export async function POST(request: NextRequest) {
  try {
    const { url, format, quality } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const downloadId = await startDownload({
      url,
      format: format === "audio" ? "audio" : "video",
      quality: typeof quality === "string" ? quality : "best",
    });

    return NextResponse.json({
      downloadId,
      message: "Download started",
    });
  } catch (error) {
    console.error("[gittube] Error starting download:", error);
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
    return NextResponse.json({ error: "Download ID is required" }, { status: 400 });
  }

  const status = getDownloadStatus(downloadId);

  if (!status) {
    return NextResponse.json({ error: "Download not found" }, { status: 404 });
  }

  return NextResponse.json(status);
}

export async function DELETE(request: NextRequest) {
  const downloadId = request.nextUrl.searchParams.get("id");

  if (!downloadId) {
    return NextResponse.json({ error: "Download ID is required" }, { status: 400 });
  }

  stopDownload(downloadId);
  return NextResponse.json({ message: "Download removed" });
}
