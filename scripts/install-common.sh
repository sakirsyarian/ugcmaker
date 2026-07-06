#!/usr/bin/env bash
# Shared helpers for install.sh and install-docker.sh

APP_UID="${APP_UID:-1000}"
APP_GID="${APP_GID:-1000}"

log() {
  printf '\n[%s] %s\n' "$(date '+%H:%M:%S')" "$1"
}

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    echo "Error: root or sudo is required for this step." >&2
    exit 1
  fi
}

ensure_env_file() {
  if [ ! -f .env ] && [ -f .env.example ]; then
    cp .env.example .env
    log "Created .env from .env.example"
  fi
}

ensure_data_dirs() {
  mkdir -p \
    data \
    uploads/products \
    uploads/models \
    uploads/backgrounds \
    downloads/videos \
    downloads/thumbnails

  if [ "$(id -u)" -eq 0 ]; then
    chown -R "${APP_UID}:${APP_GID}" data uploads downloads 2>/dev/null || true
  fi
}

load_port() {
  if [ -f .env ]; then
    # shellcheck disable=SC1091
    set -a
    source .env
    set +a
  fi
  PORT="${PORT:-3000}"
  export PORT
}
