# GitTube

A local desktop app for downloading videos and audio from 1000+ sites, powered by [yt-dlp](https://github.com/yt-dlp/yt-dlp).

Paste a video URL, choose your format and quality, and GitTube handles the rest — no accounts, no ads, nothing leaves your machine.

## Features

- **1000+ supported sites** — YouTube, Vimeo, Twitter/X, TikTok, Instagram, and more, via yt-dlp
- **Video or audio extraction** — download MP4/WebM video at up to 2160p, or extract audio to MP3 at 128k/192k/320k
- **Live progress** — per-download progress, speed, ETA, and filename updates in a queue
- **Native save dialog** — choose where each file goes; completed files are revealed in your file manager
- **Zero-config binaries** — downloads a standalone yt-dlp binary on first use and bundles ffmpeg, with automatic fallback to system installs
- **Fully local** — a self-contained desktop app (Electron + Next.js standalone) with no remote backend
- **Cross-platform** — build for macOS, Windows, and Linux

## Getting Started

### Development

```bash
npm install
npm run dev:app
```

This starts the Next.js dev server and launches the Electron shell.

### Build for production

```bash
npm run build          # build the Next.js app
npm run prepare:standalone   # assemble the standalone output (static assets, public/, ffmpeg)
npm run dist           # build + package for the current platform
```

Platform-specific packages:

```bash
npm run dist:mac       # .dmg + .zip
npm run dist:win       # NSIS installer + portable
npm run dist:linux     # AppImage + .deb
```

Artifacts are written to `release/`.

## Command-line interface

GitTube ships a standalone CLI (same yt-dlp engine) for quick downloads without the desktop app.

### Install

One command (requires Node.js):

```bash
curl -fsSL https://raw.githubusercontent.com/gairxx/git-tube-qp/main/scripts/install.sh | bash
```

This installs `gittube` to `~/.gittube/bin` (add it to your PATH as instructed). Alternatively, install from the repo with npm:

```bash
npm run gittube            # from the repo
npm install -g .           # global (from the repo)
```

### Usage

```bash
gittube -v [quality] <url> [save-location]   # video: best/2160p/1080p/720p/480p
gittube -a [quality] <url> [save-location]   # audio: 320k/192k/128k (MP3)
```

Examples:

```bash
gittube -v https://youtu.be/abc123
gittube -v 1080p https://youtu.be/abc123 ~/Movies
gittube -a 128k https://youtu.be/abc123 ~/Music/song.mp3
```

`save-location` is a directory or full file path; it defaults to the current directory.

### Container

```bash
docker build -t gittube-cli .
docker run --rm -v "$PWD":/downloads gittube-cli -v 1080p <url> /downloads
```

### MCP server (for AI agents)

An [MCP](https://modelcontextprotocol.io) server in `mcp/` exposes GitTube to AI tools and agents:

- `search` — search YouTube for videos by query (returns top 10 with title, channel, duration, URL)
- `video_info` — fetch metadata (title, duration, uploader, views, thumbnail)
- `download_video` — download a video (quality: best/2160p/1080p/720p/480p)
- `download_audio` — extract audio as MP3 (quality: 320k/192k/128k)

The easiest way to install it is the installer — it will ask whether you want
the MCP server, then which AI agents to configure it for:

```bash
curl -fsSL https://raw.githubusercontent.com/gairxx/git-tube-qp/main/scripts/install.sh | bash
```

Manual setup:

```bash
cd mcp && npm install
```

Then give your agent the config for it. In all examples below, replace
`/path/to/gitube` with the actual path to this repo, and note that the
server entry point is `mcp/server.mjs`.

#### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gittube": {
      "command": "node",
      "args": ["/path/to/gitube/mcp/server.mjs"]
    }
  }
}
```

#### Claude Code

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "gittube": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/gitube/mcp/server.mjs"]
    }
  }
}
```

or add it from the CLI:

```bash
claude mcp add gittube -- node /path/to/gitube/mcp/server.mjs
```

#### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "gittube": {
      "command": "node",
      "args": ["/path/to/gitube/mcp/server.mjs"]
    }
  }
}
```

#### opencode

Add to your `opencode.json`:

```json
{
  "mcp": {
    "gittube": {
      "type": "local",
      "command": ["node", "/path/to/gitube/mcp/server.mjs"],
      "enabled": true
    }
  }
}
```

#### Continue.dev

Add to `~/.continue/config.json`:

```json
{
  "mcpServers": {
    "gittube": {
      "command": "node",
      "args": ["/path/to/gitube/mcp/server.mjs"]
    }
  }
}
```

## How it works

- The UI is a Next.js (App Router) app served locally on `127.0.0.1:3123` by the Electron main process.
- Pasted URLs are resolved via `yt-dlp --dump-json` through `app/api/video-info`.
- Downloads run as `yt-dlp` child processes in per-job directories under `~/.gittube/downloads`; progress and completion are read from a log file and an exit-code flag so the status API never blocks.
- On completion the Electron main process opens a native save dialog (`electron/main.js`) and copies the file to your chosen location.

## Configuration

Environment variables:

| Variable | Description |
| --- | --- |
| `YTDLP_PATH` | Use a specific yt-dlp binary instead of the auto-downloaded/autodetected one |
| `FFMPEG_PATH` | Use a specific ffmpeg binary instead of the bundled/system one |
| `GITTUBE_HOME` | Override the data directory (defaults to `~/.gittube`) |
| `GITTUBE_PORT` | Override the local server port (defaults to `3123`) |

## Tech stack

- [Next.js](https://nextjs.org) 16 (App Router) + React 19
- [Electron](https://www.electronjs.org) with a preload bridge for native save dialogs
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) for extraction and downloading
- [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) for media processing
- [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- [electron-builder](https://www.electron.build) for packaging

## License

Private project.
