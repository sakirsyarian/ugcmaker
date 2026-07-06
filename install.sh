#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# shellcheck source=scripts/install-common.sh
source "$ROOT_DIR/scripts/install-common.sh"

NODE_MAJOR="${NODE_MAJOR:-22}"
PM2_APP_NAME="${PM2_APP_NAME:-ugcmaker}"

node_version_ok() {
  command -v node >/dev/null 2>&1 || return 1
  local major
  major="$(node -p "process.version.slice(1).split('.')[0]" 2>/dev/null || echo 0)"
  [ "$major" -ge "$NODE_MAJOR" ]
}

confirm_node_install() {
  if [ "${AUTO_INSTALL_NODE:-}" = "1" ]; then
    return 0
  fi

  if [ ! -t 0 ]; then
    echo "Error: Node.js ${NODE_MAJOR}+ is not installed." >&2
    echo "Install Node manually, or rerun with: AUTO_INSTALL_NODE=1 ./install.sh" >&2
    exit 1
  fi

  printf 'Node.js %s+ belum terpasang di server ini.\n' "$NODE_MAJOR"
  printf 'Install Node.js sekarang? [y/N] '
  read -r reply
  case "$reply" in
    y|Y|yes|YES) return 0 ;;
    *)
      echo "Install dibatalkan. Lihat DEPLOY.md untuk instalasi manual Node.js." >&2
      exit 1
      ;;
  esac
}

install_node_linux() {
  log "Installing Node.js ${NODE_MAJOR}.x (NodeSource)..."
  if command -v curl >/dev/null 2>&1; then
    run_root bash -c "curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -"
  elif command -v wget >/dev/null 2>&1; then
    run_root bash -c "wget -qO- https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -"
  else
    echo "Error: curl or wget is required to install Node.js." >&2
    exit 1
  fi
  run_root apt-get install -y nodejs
}

ensure_node() {
  if node_version_ok; then
    log "Node.js $(node -v) sudah terpasang, skip instalasi Node."
    return 0
  fi

  if [ "$(uname -s)" != "Linux" ]; then
    echo "Error: Auto-install Node.js hanya untuk Linux server." >&2
    echo "Install Node.js ${NODE_MAJOR}+ manual, lalu jalankan ulang ./install.sh" >&2
    exit 1
  fi

  confirm_node_install
  install_node_linux

  if ! node_version_ok; then
    echo "Error: Node.js installation finished but version is still too old." >&2
    exit 1
  fi

  log "Node.js $(node -v) berhasil diinstall."
}

ensure_build_deps() {
  if [ "$(uname -s)" != "Linux" ]; then
    return 0
  fi

  if ! command -v apt-get >/dev/null 2>&1; then
    log "Skipping build deps (apt-get not found). Install build-essential and libvips manually if npm install fails."
    return 0
  fi

  log "Installing build dependencies (build-essential, python3, libvips)..."
  run_root apt-get update -qq
  run_root apt-get install -y --no-install-recommends \
    build-essential python3 libvips42
}

confirm_pm2_install() {
  if [ "${AUTO_INSTALL_PM2:-}" = "1" ]; then
    return 0
  fi

  if [ ! -t 0 ]; then
    echo "Error: PM2 is not installed." >&2
    echo "Install PM2 manually, or rerun with: AUTO_INSTALL_PM2=1 ./install.sh" >&2
    exit 1
  fi

  printf 'PM2 belum terpasang.\n'
  printf 'Install PM2 sekarang? [y/N] '
  read -r reply
  case "$reply" in
    y|Y|yes|YES) return 0 ;;
    *)
      echo "Install dibatalkan. Install manual: npm install -g pm2" >&2
      exit 1
      ;;
  esac
}

ensure_pm2() {
  if command -v pm2 >/dev/null 2>&1; then
    log "PM2 sudah terpasang, skip instalasi PM2."
    return 0
  fi

  confirm_pm2_install
  log "Installing PM2 globally..."
  run_root npm install -g pm2
}

install_dependencies() {
  log "Installing npm dependencies..."
  npm ci --omit=dev
}

start_pm2_app() {
  export NODE_ENV=production
  load_port

  if pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
    log "Restarting existing PM2 process '$PM2_APP_NAME'..."
    pm2 delete "$PM2_APP_NAME" >/dev/null 2>&1 || true
  fi

  log "Starting UGC Maker with PM2..."
  PORT="$PORT" NODE_ENV=production pm2 start server.js --name "$PM2_APP_NAME"
  pm2 save
}

configure_pm2_startup() {
  if [ "${SKIP_PM2_STARTUP:-}" = "1" ]; then
    return 0
  fi

  if [ "${AUTO_PM2_STARTUP:-}" != "1" ]; then
    if [ ! -t 0 ]; then
      return 0
    fi
    printf 'Setup PM2 auto-start on boot? [y/N] '
    read -r reply
    case "$reply" in
      y|Y|yes|YES) ;;
      *) return 0 ;;
    esac
  fi

  log "Configuring PM2 startup on boot..."
  local startup_user startup_home startup_line
  startup_user="$(whoami)"
  startup_home="${HOME:-/root}"

  startup_line="$(pm2 startup systemd -u "$startup_user" --hp "$startup_home" 2>&1 | grep -E '^sudo env' || true)"
  if [ -n "$startup_line" ]; then
    eval "$startup_line" || run_root bash -c "${startup_line#sudo }"
    pm2 save
  fi
}

main() {
  ensure_node
  ensure_build_deps

  ensure_env_file
  ensure_data_dirs

  install_dependencies
  ensure_pm2
  start_pm2_app
  configure_pm2_startup

  load_port

  log "UGC Maker is running (PM2)."
  echo "  Local:    http://localhost:${PORT}"
  echo "  Status:   pm2 status"
  echo "  Logs:     pm2 logs ${PM2_APP_NAME}"
  echo "  Restart:  pm2 restart ${PM2_APP_NAME}"
  echo "  Stop:     pm2 stop ${PM2_APP_NAME}"
  echo ""
  echo "Persistent data:"
  echo "  - Database: ./data/ugc.db"
  echo "  - Uploads:  ./uploads"
  echo "  - Videos:   ./downloads"
  echo ""
  echo "For Docker deploy instead: ./install-docker.sh"
  echo "See DEPLOY.md for the full guide (backup, update, troubleshooting)."
}

main "$@"
