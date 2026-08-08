import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import { Sandbox } from "@vercel/sandbox";
import { DOWNLOADS_DIR, contentTypeForExt } from "@/lib/sandbox-ytdlp";

// Large video files can take a while to stream out of the sandbox.
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const downloadId = request.nextUrl.searchParams.get("id");

  if (!downloadId) {
    return NextResponse.json({ error: "Download ID is required" }, { status: 400 });
  }

  let sandbox;
  try {
    sandbox = await Sandbox.get({ name: downloadId });
  } catch {
    return NextResponse.json({ error: "Download not found" }, { status: 404 });
  }

  const files = await sandbox.fs
    .readdir(DOWNLOADS_DIR)
    .catch(() => [] as string[]);

  if (files.length === 0) {
    return NextResponse.json({ error: "File is not ready yet" }, { status: 404 });
  }

  const filename = files[0];
  const stream = await sandbox.readFile({ path: `${DOWNLOADS_DIR}/${filename}` });

  if (!stream) {
    return NextResponse.json({ error: "File is not ready yet" }, { status: 404 });
  }

  const ext = filename.split(".").pop() || "";

  // Sandboxes auto-expire on their own timeout, so we intentionally don't
  // stop() here — doing so could cut the response off mid-stream.
  return new Response(Readable.toWeb(stream as Readable) as ReadableStream, {
    headers: {
      "Content-Type": contentTypeForExt(ext),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
