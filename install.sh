#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# shellcheck source=scripts/install-common.sh
source "$ROOT_DIR/scripts/install-common.sh"

PM2_APP_NAME="${PM2_APP_NAME:-ugcmaker}"

bun_ready() {
  command -v bun >/dev/null 2>&1
}

confirm_bun_install() {
  if [ "${AUTO_INSTALL_BUN:-}" = "1" ]; then
    return 0
  fi

  if [ ! -t 0 ]; then
    echo "Error: Bun is not installed." >&2
    echo "Install Bun manually, or rerun with: AUTO_INSTALL_BUN=1 ./install.sh" >&2
    exit 1
  fi

  printf 'Bun belum terpasang di server ini.\n'
  printf 'Install Bun sekarang? [y/N] '
  read -r reply
  case "$reply" in
    y|Y|yes|YES) return 0 ;;
    *)
      echo "Install dibatalkan. Lihat https://bun.sh/docs/installation" >&2
      exit 1
      ;;
  esac
}

install_bun_linux() {
  log "Installing Bun (https://bun.sh/install)..."
  if command -v curl >/dev/null 2>&1; then
    run_root bash -c 'curl -fsSL https://bun.sh/install | bash'
  elif command -v wget >/dev/null 2>&1; then
    run_root bash -c 'wget -qO- https://bun.sh/install | bash'
  else
    echo "Error: curl or wget is required to install Bun." >&2
    exit 1
  fi

  if ! bun_ready; then
    export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
    export PATH="$BUN_INSTALL/bin:$PATH"
  fi
}

ensure_bun() {
  if bun_ready; then
    log "Bun sudah terpasang ($(bun --version)), skip instalasi Bun."
    return 0
  fi

  if [ "$(uname -s)" != "Linux" ]; then
    echo "Error: Auto-install Bun hanya untuk Linux server." >&2
    echo "Di Windows/Mac, install Bun dari https://bun.sh" >&2
    exit 1
  fi

  confirm_bun_install
  install_bun_linux

  if ! bun_ready; then
    echo "Error: Bun installation finished but bun is not in PATH." >&2
    echo "Try: export PATH=\"\$HOME/.bun/bin:\$PATH\"" >&2
    exit 1
  fi

  log "Bun berhasil diinstall."
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
      echo "Install dibatalkan. Install manual: bun add -g pm2" >&2
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
  run_root bun add -g pm2
}

install_dependencies() {
  log "Installing dependencies (bun install)..."
  bun install --production
}

start_pm2_app() {
  export NODE_ENV=production
  load_port

  if pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
    log "Restarting existing PM2 process '$PM2_APP_NAME'..."
    pm2 delete "$PM2_APP_NAME" >/dev/null 2>&1 || true
  fi

  log "Starting UGC Maker with PM2..."
  PORT="$PORT" NODE_ENV=production pm2 start bun --name "$PM2_APP_NAME" -- run src/index.ts
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
  ensure_bun

  ensure_env_file
  ensure_data_dirs

  install_dependencies
  ensure_pm2
  start_pm2_app
  configure_pm2_startup

  load_port

  log "UGC Maker is running (Bun + PM2)."
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
