import { NextRequest, NextResponse } from "next/server";
import { Readable } from "node:stream";
import fs from "node:fs";
import path from "node:path";
import { contentTypeForExt, getDownloadedFile } from "@/lib/downloader";

export async function GET(request: NextRequest) {
  const downloadId = request.nextUrl.searchParams.get("id");

  if (!downloadId) {
    return NextResponse.json({ error: "Download ID is required" }, { status: 400 });
  }

  const file = getDownloadedFile(downloadId);

  if (!file || !fs.existsSync(file.absPath)) {
    return NextResponse.json({ error: "File is not ready yet" }, { status: 404 });
  }

  const ext = path.extname(file.filename).slice(1);

  const stream = fs.createReadStream(file.absPath);

  return new Response(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      "Content-Type": contentTypeForExt(ext),
      "Content-Length": String(fs.statSync(file.absPath).size),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(file.filename)}"`,
    },
  });
}
