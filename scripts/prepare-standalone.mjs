import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standaloneDir = path.join(root, ".next", "standalone");

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

fs.mkdirSync(standaloneDir, { recursive: true });
copyDir(path.join(root, ".next", "static"), path.join(standaloneDir, ".next", "static"));
copyDir(path.join(root, "public"), path.join(standaloneDir, "public"));

// ffmpeg-static ships a platform binary as a non-JS asset that build-time
// tracing does not follow; copy the whole package into the standalone output.
const ffmpegStaticPkg = path.join(root, "node_modules", "ffmpeg-static");
if (fs.existsSync(ffmpegStaticPkg)) {
  copyDir(ffmpegStaticPkg, path.join(standaloneDir, "node_modules", "ffmpeg-static"));
}

console.log("[prepare-standalone] copied .next/static, public and ffmpeg-static into standalone output");
