#!/bin/sh
set -e

mkdir -p \
  /app/data \
  /app/uploads/products \
  /app/uploads/models \
  /app/uploads/backgrounds \
  /app/downloads/videos \
  /app/downloads/thumbnails

chown -R node:node /app/data /app/uploads /app/downloads

exec su -s /bin/sh node -c 'exec "$@"' sh "$@"
