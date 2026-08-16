#!/usr/bin/env bash
set -euo pipefail

# GitTube installer — installs the CLI, the desktop GUI, or both.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/gairxx/git-tube-qp/main/scripts/install.sh | bash
#   bash install.sh --cli | --gui | --both   (skip the prompt)
#
# Env overrides:
#   GITTUBE_HOME      install dir base for the CLI (default: ~/.gittube)
#   GITTUBE_RELEASE   GitHub release tag for the GUI (default: latest)
#   GITTUBE_CLI_URL   full URL for the CLI script (testing)

VERSION="${1:-main}"
RELEASE_TAG="${GITTUBE_RELEASE:-latest}"
INSTALL_DIR="${GITTUBE_HOME:-$HOME/.gittube}/bin"
CLI_URL="${GITTUBE_CLI_URL:-https://raw.githubusercontent.com/gairxx/git-tube-qp/${VERSION}/scripts/gittube-cli.mjs}"

DO_CLI=false
DO_GUI=false

# ---------------------------------------------------------------------------
# Decide what to install
# ---------------------------------------------------------------------------

if [ $# -gt 0 ]; then
  case "$1" in
    --cli)  DO_CLI=true ;;
    --gui)  DO_GUI=true ;;
    --both) DO_CLI=true; DO_GUI=true ;;
    *) echo "Error: unknown option \"$1\" (use --cli, --gui, or --both)" >&2; exit 1 ;;
  esac
fi

if ! $DO_CLI && ! $DO_GUI; then
  echo "What would you like to install?"
  echo "  1) CLI — the \"gittube\" command for downloads from a terminal"
  echo "  2) GUI — the GitTube desktop app"
  echo "  3) Both"
  printf "Choose 1, 2, or 3: "
  read -r -n 1 choice < /dev/tty || exit 1
  echo
  case "$choice" in
    1) DO_CLI=true ;;
    2) DO_GUI=true ;;
    3) DO_CLI=true; DO_GUI=true ;;
    *) echo "Error: invalid choice \"$choice\"" >&2; exit 1 ;;
  esac
fi

# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

install_cli() {
  if ! command -v node >/dev/null 2>&1; then
    echo "Error: the CLI needs Node.js, which was not found on PATH." >&2
    echo "Install it from https://nodejs.org then re-run the installer." >&2
    return 1
  fi

  mkdir -p "$INSTALL_DIR"
  echo "Downloading gittube CLI…"
  if ! curl -fsSL "$CLI_URL" -o "$INSTALL_DIR/gittube"; then
    echo "Error: failed to download the CLI from $CLI_URL" >&2
    return 1
  fi
  chmod +x "$INSTALL_DIR/gittube"
  echo "CLI installed to $INSTALL_DIR/gittube"
}

# ---------------------------------------------------------------------------
# PATH
# ---------------------------------------------------------------------------

# Appends INSTALL_DIR to the user's shell rc file so `gittube` is on PATH
# in new shells. Skips when already present.
add_to_path() {
  if [[ ":$PATH:" == *":$INSTALL_DIR:"* ]]; then
    return 0
  fi

  local rc line shell_name
  shell_name="${SHELL##*/}"
  case "$shell_name" in
    zsh)   rc="$HOME/.zshrc" ;;
    bash)  rc="$HOME/.bashrc" ;;
    *)     rc="$HOME/.profile" ;;
  esac

  [ -f "$rc" ] || : > "$rc"
  line="export PATH=\"\$PATH:$INSTALL_DIR\""
  if grep -qF "$INSTALL_DIR" "$rc" 2>/dev/null; then
    echo "gittube already on PATH ($rc)"
  else
    printf '\n# Added by the GitTube installer\nexport PATH="$PATH:%s"\n' "$INSTALL_DIR" >> "$rc"
    echo "Added gittube to PATH in $rc"
  fi
}

# ---------------------------------------------------------------------------
# GUI (desktop app)
# ---------------------------------------------------------------------------

install_gui() {
  local os arch
  os="$(uname -s)"
  arch="$(uname -m)"

  if [ "$os" != "Darwin" ]; then
    echo "The GUI installer currently supports macOS only." >&2
    echo "You can still install the CLI (or build the desktop app from source)." >&2
    return 1
  fi

  if [ "$arch" != "arm64" ]; then
    echo "The prebuilt GUI is Apple Silicon (arm64) only for now." >&2
    echo "You can still install the CLI, or build the app from source." >&2
    return 1
  fi

  local url tmp app
  url="https://github.com/gairxx/git-tube-qp/releases/download/${RELEASE_TAG}/GitTube-1.0.0-arm64-mac.zip"
  tmp="$(mktemp -d)"

  echo "Downloading GitTube desktop app…"
  curl -fsSL "$url" -o "$tmp/GitTube.zip"
  echo "Installing to /Applications…"
  unzip -q "$tmp/GitTube.zip" -d "$tmp"

  app="$(find "$tmp" -maxdepth 2 -name "*.app" -print -quit)"
  if [ -z "$app" ]; then
    echo "Error: could not find GitTube.app in the downloaded package." >&2
    rm -rf "$tmp"
    return 1
  fi

  rm -rf "/Applications/GitTube.app"
  cp -R "$app" /Applications/
  # Clear Gatekeeper quarantine so the app opens without "right-click → Open".
  xattr -dr com.apple.quarantine "/Applications/GitTube.app" 2>/dev/null || true
  rm -rf "$tmp"
  echo "GitTube desktop app installed to /Applications"
}

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

ok=false
if $DO_CLI; then
  install_cli && ok=true
fi
if $DO_GUI; then
  install_gui && ok=true
fi

if ! $ok; then
  echo "Nothing was installed." >&2
  exit 1
fi

if $DO_CLI; then
  if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    add_to_path
  else
    echo "gittube is already on PATH."
  fi
  echo
  echo "CLI usage:"
  echo "  gittube -v <url> [save-location]"
  echo "  gittube -a <url> [save-location]"
fi

if $DO_GUI; then
  echo
  echo "Open GitTube from /Applications."
fi
