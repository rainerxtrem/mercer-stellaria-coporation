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

if [ "$RUN_MIGRATIONS_ON_BOOT" != "false" ]; then
  echo "==> Applying database migrations"
  node scripts/migrate.mjs
fi

echo "==> Starting application on port ${PORT:-8080}"
exec node server/index.mjs
