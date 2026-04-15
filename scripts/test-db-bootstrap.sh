#!/usr/bin/env bash
# scripts/test-db-bootstrap.sh
#
# Bootstraps the local test database for RLS integration tests.
# Applies supabase/tests/schema.sql + supabase/tests/seed.sql via psql.
#
# Use this for manual debugging. The Vitest harness calls the same SQL
# files via the pg client (see supabase/tests/rls/_helpers.ts::resetDb).
#
# Prerequisites:
#   - Docker Desktop running
#   - supabase start  (containers up on ports 54321/54322)
#   - libpq/psql installed (brew install libpq)
#
# Usage:
#   ./scripts/test-db-bootstrap.sh
#
# See docs/rls-testing.md for the full workflow.

set -euo pipefail

export PATH="/opt/homebrew/opt/libpq/bin:$PATH"
export PGPASSWORD="${PGPASSWORD:-postgres}"

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-54322}"
DB_USER="${DB_USER:-postgres}"
DB_NAME="${DB_NAME:-postgres}"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SCHEMA="$ROOT/supabase/tests/schema.sql"
SEED="$ROOT/supabase/tests/seed.sql"

if ! command -v psql >/dev/null 2>&1; then
  echo "[bootstrap] ERROR: psql not found. Install with: brew install libpq" >&2
  exit 1
fi

if ! psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" >/dev/null 2>&1; then
  echo "[bootstrap] ERROR: cannot connect to $DB_HOST:$DB_PORT. Is 'supabase start' running?" >&2
  exit 1
fi

echo "[bootstrap] Applying schema.sql..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 --quiet -f "$SCHEMA"

echo "[bootstrap] Applying seed.sql..."
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 --quiet -f "$SEED"

echo "[bootstrap] Done. Try:"
echo "  npm run test:rls"
echo "  psql postgresql://postgres:postgres@$DB_HOST:$DB_PORT/$DB_NAME"
