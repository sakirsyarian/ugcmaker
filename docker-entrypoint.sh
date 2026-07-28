#!/bin/sh
set -e

mkdir -p \
  /app/data \
  /app/uploads/products \
  /app/uploads/models \
  /app/uploads/backgrounds \
  /app/downloads/videos \
  /app/downloads/thumbnails

if id bun >/dev/null 2>&1; then
  chown -R bun:bun /app/data /app/uploads /app/downloads 2>/dev/null || true
  exec su -s /bin/sh bun -c 'exec "$@"' sh "$@"
fi

exec "$@"
