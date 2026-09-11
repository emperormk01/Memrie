#!/usr/bin/env bash
set -e
REPO="emperormk01/Memrie"
os=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)
case "$arch" in x86_64|amd64) arch="x64";; aarch64|arm64) arch="arm64";; esac
case "$os" in linux) os="linux";; darwin) os="darwin";; *) echo "unsupported $os" >&2; exit 1;; esac
asset="memrie-${os}-${arch}"
url="https://github.com/${REPO}/releases/latest/download/${asset}"
curl -fsSL "$url" -o memrie && chmod +x memrie && echo "Downloaded ./memrie"
