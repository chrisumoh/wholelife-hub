#!/usr/bin/env bash
set -euo pipefail

# Use only the ephemeral GitHub Actions PostgreSQL service or a deliberately
# disposable local database. Never point this script at a hosted project.
case "${PGHOST:-}" in
  localhost|127.0.0.1|::1) ;;
  *) echo "Refusing non-local PGHOST" >&2; exit 2 ;;
esac

cd "$(dirname "$0")/../.."
export PGOPTIONS='-c search_path=public'
psql -X -v ON_ERROR_STOP=1 -f tests/db/bootstrap.sql

shopt -s nullglob
migrations=(supabase/migrations/*.sql)
((${#migrations[@]})) || { echo "No migrations found" >&2; exit 1; }
for migration in "${migrations[@]}"; do
  echo "Applying $migration"
  psql -X -v ON_ERROR_STOP=1 --single-transaction -f "$migration" >/dev/null
done

psql -X -v ON_ERROR_STOP=1 -f tests/db/verify.sql
echo "Applied and verified ${#migrations[@]} migrations on disposable PostgreSQL"
