#!/usr/bin/env bash
# Recreate a database from a dump made by scripts/db-dump.sh.
#
# Usage:
#   scripts/db-restore.sh <dump-file> <target-database-url> [--yes]
#
#   <dump-file>            .dump (pg_dump custom format) or .sql (plain SQL)
#   <target-database-url>  database to restore INTO, e.g. postgresql://localhost:5432/library
#   --yes                  skip the confirmation prompt (also required to restore to a non-local host)
#
# The target database is created if it does not exist. Existing objects with
# the same names are dropped and recreated (--clean --if-exists), so any data
# in those tables is replaced. (.sql files from before --clean was added to
# db-dump.sh fail on a non-empty target; use the .dump file or an empty database.)

set -euo pipefail

usage() { sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

[[ $# -lt 2 || "$1" == "-h" || "$1" == "--help" ]] && usage

DUMP_FILE="$1"
TARGET_URL="$2"
ASSUME_YES="${3:-}"

[[ -f "$DUMP_FILE" ]] || { echo "error: dump file not found: $DUMP_FILE" >&2; exit 1; }
[[ "$TARGET_URL" =~ ^postgres(ql)?://([^@/]*@)?([^:/?]*)(:[0-9]+)?/([^?]+) ]] \
  || { echo "error: target URL must look like postgresql://[user[:pass]@]host[:port]/dbname" >&2; exit 1; }

HOST="${BASH_REMATCH[3]}"
DB_NAME="${BASH_REMATCH[5]}"

# Restore over a direct connection, never a Neon pooler. Plain SQL dumps run
# set_config('search_path', '', false); through a pooler that setting leaks into
# the pooled server connections and breaks the app ("relation ... does not exist").
if [[ "$HOST" == *-pooler* ]]; then
  DIRECT_HOST="${HOST/-pooler/}"
  echo "note: using direct host '$DIRECT_HOST' instead of pooler '$HOST'." >&2
  TARGET_URL="${TARGET_URL/@$HOST/@$DIRECT_HOST}"
  HOST="$DIRECT_HOST"
fi

for cmd in psql pg_restore; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "error: $cmd not found (install PostgreSQL client tools)." >&2; exit 1; }
done

IS_LOCAL=false
case "$HOST" in ""|localhost|127.0.0.1|::1|\[::1\]) IS_LOCAL=true ;; esac

if [[ "$IS_LOCAL" == false && "$ASSUME_YES" != "--yes" ]]; then
  echo "error: target host '$HOST' is not local. Re-run with --yes if you really want to overwrite it." >&2
  exit 1
fi

if [[ "$ASSUME_YES" != "--yes" ]]; then
  read -r -p "Restore '$DUMP_FILE' into database '$DB_NAME' on '${HOST:-local socket}'? Existing tables will be replaced. [y/N] " reply
  [[ "$reply" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 1; }
fi

# Create the target database if it doesn't exist (connect to the 'postgres' maintenance db).
# Same URL but pointing at the 'postgres' maintenance db (keeps credentials and ?query params).
[[ "$TARGET_URL" =~ ^([a-z]+://[^/]*)/[^?]+(\?.*)?$ ]]
ADMIN_URL="${BASH_REMATCH[1]}/postgres${BASH_REMATCH[2]}"
EXISTS="$(psql "$ADMIN_URL" -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME//\'/\'\'}'" 2>/dev/null || true)"
if [[ "$EXISTS" != "1" ]]; then
  echo "Creating database '$DB_NAME'..."
  psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${DB_NAME//\"/\"\"}\""
fi

echo "Restoring..."
case "$DUMP_FILE" in
  *.sql)
    psql "$TARGET_URL" -v ON_ERROR_STOP=1 -q -f "$DUMP_FILE"
    ;;
  *)
    pg_restore --no-owner --no-privileges --clean --if-exists --exit-on-error \
      --dbname="$TARGET_URL" "$DUMP_FILE"
    ;;
esac

echo
echo "Restored. Tables and row counts:"
psql "$TARGET_URL" -c "
  SELECT relname AS table, n_live_tup AS approx_rows
  FROM pg_stat_user_tables ORDER BY relname;"
