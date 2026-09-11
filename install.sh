#!/usr/bin/env bash
set -e
REPO="emperormk01/Memrie"
BINARY="memrie"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"

detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "x64" ;;
    aarch64|arm64) echo "arm64" ;;
    *) echo "unsupported arch $(uname -m)" >&2; exit 1 ;;
  esac
}

detect_os() {
  case "$(uname -s)" in
    Linux) echo "linux" ;;
    Darwin) echo "darwin" ;;
    *) echo "unsupported OS $(uname -s)" >&2; exit 1 ;;
  esac
}

os=$(detect_os)
arch=$(detect_arch)
target="${os}-${arch}"
asset="memrie-${target}"
url="https://github.com/${REPO}/releases/latest/download/${asset}"

echo "[info] Installing ${BINARY} for ${target}..." >&2
echo "[info] Downloading ${url}..." >&2

mkdir -p "$INSTALL_DIR"
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

if ! curl -fsSL "$url" -o "$tmp"; then
  echo "[error] Download failed. Check https://github.com/${REPO}/releases" >&2
  exit 1
fi

chmod +x "$tmp"
mv "$tmp" "$INSTALL_DIR/$BINARY"
echo "[ok] Installed to $INSTALL_DIR/$BINARY" >&2

if ! echo "$PATH" | tr ':' '\n' | grep -qx "$INSTALL_DIR"; then
  echo "[warn] $INSTALL_DIR is not in your PATH." >&2
  echo "  Add to PATH: echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> ~/.bashrc" >&2
fi

echo "[ok] Run: memrie --help" >&2
