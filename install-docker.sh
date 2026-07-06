#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# shellcheck source=scripts/install-common.sh
source "$ROOT_DIR/scripts/install-common.sh"

COMPOSE=()

docker_info_ok() {
  docker info >/dev/null 2>&1
}

sudo_docker_info_ok() {
  sudo docker info >/dev/null 2>&1
}

compose_available() {
  docker compose version >/dev/null 2>&1 \
    || sudo docker compose version >/dev/null 2>&1 \
    || command -v docker-compose >/dev/null 2>&1 \
    || sudo docker-compose version >/dev/null 2>&1
}

docker_ready() {
  command -v docker >/dev/null 2>&1 \
    && compose_available \
    && { docker_info_ok || sudo_docker_info_ok; }
}

confirm_docker_install() {
  if [ "${AUTO_INSTALL_DOCKER:-}" = "1" ]; then
    return 0
  fi

  if [ ! -t 0 ]; then
    echo "Error: Docker is not installed." >&2
    echo "Install Docker manually, or rerun with: AUTO_INSTALL_DOCKER=1 ./install-docker.sh" >&2
    exit 1
  fi

  printf 'Docker belum terpasang di server ini.\n'
  printf 'Install Docker sekarang? [y/N] '
  read -r reply
  case "$reply" in
    y|Y|yes|YES) return 0 ;;
    *)
      echo "Install dibatalkan. Lihat DEPLOY.md untuk instalasi manual Docker." >&2
      exit 1
      ;;
  esac
}

install_docker_linux() {
  log "Installing Docker (official script from get.docker.com)..."
  if command -v curl >/dev/null 2>&1; then
    run_root sh -c 'curl -fsSL https://get.docker.com | sh'
  elif command -v wget >/dev/null 2>&1; then
    run_root sh -c 'wget -qO- https://get.docker.com | sh'
  else
    echo "Error: curl or wget is required to install Docker." >&2
    exit 1
  fi

  if command -v systemctl >/dev/null 2>&1; then
    run_root systemctl enable docker >/dev/null 2>&1 || true
    run_root systemctl start docker >/dev/null 2>&1 || true
  fi

  if [ "$(id -u)" -ne 0 ] && id -nG "$USER" | tr ' ' '\n' | grep -qx docker; then
    : # already in docker group
  elif [ "$(id -u)" -ne 0 ]; then
    run_root usermod -aG docker "$USER" >/dev/null 2>&1 || true
    if ! docker_info_ok && sudo_docker_info_ok; then
      log "Docker installed. Current session will use sudo for Docker commands."
      log "Log out and log back in to use Docker without sudo."
    fi
  fi
}

ensure_docker() {
  if docker_ready; then
    log "Docker sudah terpasang, skip instalasi Docker."
    return 0
  fi

  if [ "$(uname -s)" != "Linux" ]; then
    echo "Error: Auto-install Docker hanya untuk Linux server." >&2
    echo "Di Windows/Mac, install Docker Desktop dulu (lihat DEPLOY.md)." >&2
    exit 1
  fi

  confirm_docker_install
  install_docker_linux

  if ! docker_ready; then
    echo "Error: Docker installation finished but Docker is not ready yet." >&2
    echo "Try: sudo systemctl start docker" >&2
    echo "Then rerun: ./install-docker.sh" >&2
    exit 1
  fi

  log "Docker berhasil diinstall."
}

resolve_compose() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE=(docker compose)
  elif sudo docker compose version >/dev/null 2>&1; then
    COMPOSE=(sudo docker compose)
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE=(docker-compose)
  elif sudo docker-compose version >/dev/null 2>&1; then
    COMPOSE=(sudo docker-compose)
  else
    echo "Error: Docker Compose is required but not available." >&2
    exit 1
  fi
}

main() {
  ensure_docker
  resolve_compose

  ensure_env_file
  ensure_data_dirs

  log "Building and starting UGC Maker (Docker)..."
  "${COMPOSE[@]}" up -d --build

  load_port

  log "UGC Maker is running (Docker)."
  echo "  Local:  http://localhost:${PORT}"
  echo "  Logs:   ${COMPOSE[*]} logs -f"
  echo "  Stop:   ${COMPOSE[*]} down"
  echo ""
  echo "Persistent data:"
  echo "  - Database: Docker volume 'ugcmaker-data'"
  echo "  - Uploads:  ./uploads"
  echo "  - Videos:   ./downloads"
  echo ""
  echo "For lighter VPS deploy (PM2): ./install.sh"
  echo "See DEPLOY.md for the full guide (backup, update, troubleshooting)."
}

main "$@"
