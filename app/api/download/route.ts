import { NextRequest, NextResponse } from "next/server";
import { Sandbox } from "@vercel/sandbox";
import {
  DONE_FLAG,
  DOWNLOADS_DIR,
  PROGRESS_LOG,
  YT_DLP_BIN,
  buildYtDlpArgs,
  ensureFfmpeg,
  ensureYtDlp,
  generateDownloadId,
  parseProgressLog,
  shQuote,
} from "@/lib/sandbox-ytdlp";

// Downloads run as a detached background process inside the sandbox, so the
// POST request itself should return quickly once the process has started.
export const maxDuration = 120;

// How long the sandbox is allowed to stay alive to finish the download.
const SANDBOX_TIMEOUT_MS = 30 * 60_000;

export async function POST(request: NextRequest) {
  try {
    const { url, format, quality } = await request.json();

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const downloadId = generateDownloadId();

    // A named sandbox lets later GET/DELETE requests (even from a different
    // Function instance) reconnect to the same microVM via Sandbox.get().
    const sandbox = await Sandbox.create({
      name: downloadId,
      timeout: SANDBOX_TIMEOUT_MS,
    });

    await sandbox.mkDir(DOWNLOADS_DIR);
    await ensureYtDlp(sandbox);
    await ensureFfmpeg(sandbox);

    const args = buildYtDlpArgs({ url, format, quality });
    const quotedCmd = [YT_DLP_BIN, ...args.map(shQuote)].join(" ");

    // Redirect all output to a log file and record the exit code to a flag
    // file once done, so progress can be polled purely by reading files —
    // no in-memory state needs to survive between requests.
    const fullCommand = `${quotedCmd} > ${PROGRESS_LOG} 2>&1; echo $? > ${DONE_FLAG}`;

    await sandbox.runCommand({
      cmd: "sh",
      args: ["-c", fullCommand],
      detached: true,
    });

    return NextResponse.json({
      downloadId,
      message: "Download started",
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
    return NextResponse.json({ error: "Download ID is required" }, { status: 400 });
  }

  let sandbox;
  try {
    sandbox = await Sandbox.get({ name: downloadId });
  } catch {
    return NextResponse.json({ error: "Download not found" }, { status: 404 });
  }

  const logBuffer = await sandbox.readFileToBuffer({ path: PROGRESS_LOG });
  const log = logBuffer ? logBuffer.toString("utf8") : "";
  const parsed = parseProgressLog(log);

  const doneBuffer = await sandbox.readFileToBuffer({ path: DONE_FLAG });

  if (doneBuffer) {
    const exitCode = parseInt(doneBuffer.toString("utf8").trim(), 10);

    if (exitCode === 0) {
      const files = await sandbox.fs
        .readdir(`/vercel/sandbox/${DOWNLOADS_DIR}`)
        .catch(() => [] as string[]);
      const filename = files.length > 0 ? files[0] : parsed.filename;

      return NextResponse.json({
        progress: 100,
        status: "completed",
        filename,
      });
    }

    const tail = log.split("\n").filter(Boolean).slice(-5).join("\n");
    return NextResponse.json({
      progress: parsed.progress ?? 0,
      status: "error",
      error: tail || `yt-dlp exited with code ${exitCode}`,
    });
  }

  return NextResponse.json({
    progress: parsed.progress ?? 0,
    status: "downloading",
    speed: parsed.speed,
    eta: parsed.eta,
    filename: parsed.filename,
  });
}

export async function DELETE(request: NextRequest) {
  const downloadId = request.nextUrl.searchParams.get("id");

  if (!downloadId) {
    return NextResponse.json({ error: "Download ID is required" }, { status: 400 });
  }

  try {
    const sandbox = await Sandbox.get({ name: downloadId });
    await sandbox.stop();
  } catch {
    // Sandbox may already be stopped/expired — nothing to clean up.
  }

  return NextResponse.json({ message: "Download removed" });
}
