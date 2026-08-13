#!/bin/sh
# Container entrypoint: bring the schema up to date, then start the server.
#
# Migrations are versioned and additive; the runner is a no-op when the
# database is already current, so restarts and rollbacks are safe.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set. Attach a PostgreSQL service and expose DATABASE_URL." >&2
  exit 1
fi

STORAGE_ROOT_PATH="${STORAGE_ROOT:-/data/storage}"
echo "==> Preparing storage root at ${STORAGE_ROOT_PATH}"
mkdir -p "$STORAGE_ROOT_PATH"
chown -R app:app "$(dirname "$STORAGE_ROOT_PATH")"

if [ "$RUN_MIGRATIONS_ON_BOOT" != "false" ]; then
  echo "==> Applying database migrations"
  su-exec app node scripts/migrate.mjs
fi

echo "==> Starting application on port ${PORT:-8080}"
exec su-exec app node server/index.mjs
