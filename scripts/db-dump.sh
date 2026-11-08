#!/usr/bin/env bash
# Create a local dump of all data (schema + rows) from a PostgreSQL/Neon database.
#
# Usage:
#   scripts/db-dump.sh <database-url> [output-dir]
#
# Produces, in output-dir (default: ./dumps):
#   library-<timestamp>.dump   pg_dump custom format (compressed; restore with pg_restore)
#   library-<timestamp>.sql    plain SQL (human-readable; restore with psql)
#
# Restore examples:
#   pg_restore --no-owner --no-privileges --clean --if-exists -d "<target-url>" dumps/library-<ts>.dump
#   psql "<target-url>" -f dumps/library-<ts>.sql
#
# Requires pg_dump with a major version >= the server's version.

set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 || "$1" == "-h" || "$1" == "--help" ]]; then
  sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
fi

DB_URL="$1"
OUT_DIR="${2:-./dumps}"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "error: pg_dump not found. Install PostgreSQL client tools (e.g. brew install libpq)." >&2
  exit 1
fi

if [[ ! "$DB_URL" =~ ^postgres(ql)?:// ]]; then
  echo "error: database URL must start with postgres:// or postgresql://" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"   # dumps contain production data (emails, sessions, OAuth tokens)

TS="$(date +%Y%m%d-%H%M%S)"
CUSTOM_FILE="$OUT_DIR/library-$TS.dump"
SQL_FILE="$OUT_DIR/library-$TS.sql"

COMMON_FLAGS=(--no-owner --no-privileges --verbose --dbname="$DB_URL")

umask 077

echo "Dumping (custom format) -> $CUSTOM_FILE"
pg_dump "${COMMON_FLAGS[@]}" --format=custom --file="$CUSTOM_FILE"

echo "Dumping (plain SQL)     -> $SQL_FILE"
pg_dump "${COMMON_FLAGS[@]}" --format=plain --clean --if-exists --file="$SQL_FILE"

echo
echo "Done:"
ls -lh "$CUSTOM_FILE" "$SQL_FILE"
