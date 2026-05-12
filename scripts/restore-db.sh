#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# scripts/restore-db.sh — restore Postgres dump produced by backup-db.sh
# ----------------------------------------------------------------------------
# USAGE
#   ./scripts/restore-db.sh /var/backups/tms/tms-tms_prod-20260513-030000.dump.gz
#
# DESTRUCTIVE: this drops and recreates all objects in the target database.
# Run only during planned downtime. Stop API+web first:
#   docker compose -f docker-compose.prod.yml stop api web
#
# WHAT IT DOES
#   1. Verifies argument and file existence.
#   2. Requires interactive confirmation ("TMS-RESTORE").
#   3. Captures row counts BEFORE for: users, organizations, trips, events.
#   4. Pipes gunzip → pg_restore --clean --if-exists into the postgres container.
#   5. Captures row counts AFTER, prints a side-by-side diff.
#   6. Reminds operator to start api+web.
# ----------------------------------------------------------------------------

set -euo pipefail

# ----- args -----------------------------------------------------------------
if [[ $# -ne 1 ]]; then
  echo "usage: $0 <path-to-dump.gz>" >&2
  exit 2
fi

DUMP_FILE="$1"
if [[ ! -f "${DUMP_FILE}" ]]; then
  echo "FATAL: dump file not found: ${DUMP_FILE}" >&2
  exit 2
fi

# ----- env ------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "FATAL: .env not found at ${ENV_FILE}" >&2
  exit 2
fi
# shellcheck disable=SC1090
set -a; source "${ENV_FILE}"; set +a

: "${POSTGRES_DB:?POSTGRES_DB must be set in .env}"
: "${POSTGRES_USER:?POSTGRES_USER must be set in .env}"

COMPOSE_FILE="${COMPOSE_FILE:-${PROJECT_ROOT}/docker-compose.prod.yml}"
TABLES=(users organizations trips events)

# ----- confirmation ---------------------------------------------------------
cat <<EOF
============================================================
  TMS DATABASE RESTORE — DESTRUCTIVE OPERATION
============================================================
  Target database : ${POSTGRES_DB}
  Target user     : ${POSTGRES_USER}
  Dump file       : ${DUMP_FILE}
  Compose file    : ${COMPOSE_FILE}
  Host            : $(hostname)
  Time (UTC)      : $(date -u +'%Y-%m-%dT%H:%M:%SZ')
------------------------------------------------------------
  This will DROP and recreate all objects in '${POSTGRES_DB}'.
  All current data will be REPLACED by the dump contents.
  Make sure api+web are stopped:
    docker compose -f ${COMPOSE_FILE} stop api web
============================================================
EOF

read -r -p "Type 'TMS-RESTORE' to confirm: " CONFIRM
if [[ "${CONFIRM}" != "TMS-RESTORE" ]]; then
  echo "aborted — confirmation phrase did not match."
  exit 1
fi

# ----- helpers --------------------------------------------------------------
psql_count() {
  local table="$1"
  docker compose -f "${COMPOSE_FILE}" exec -T postgres \
    psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -tA -c \
    "SELECT count(*) FROM ${table};" 2>/dev/null || echo "ERR"
}

snapshot() {
  local -n out=$1
  for t in "${TABLES[@]}"; do
    out[$t]="$(psql_count "$t")"
  done
}

# ----- BEFORE ---------------------------------------------------------------
declare -A BEFORE AFTER
echo
echo "→ snapshotting row counts BEFORE restore…"
snapshot BEFORE
for t in "${TABLES[@]}"; do printf "  %-15s %s\n" "$t" "${BEFORE[$t]}"; done

# ----- restore --------------------------------------------------------------
echo
echo "→ piping dump into pg_restore…"
set +e
gunzip -c "${DUMP_FILE}" | docker compose -f "${COMPOSE_FILE}" exec -T postgres \
  pg_restore --clean --if-exists --no-owner --no-acl \
             -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"
RC=$?
set -e

# pg_restore exits non-zero on harmless warnings (missing objects to drop on
# fresh DBs). We surface the exit code but proceed to row-count diff so the
# operator can judge severity.
if [[ ${RC} -ne 0 ]]; then
  echo "WARN: pg_restore exited ${RC} — review output above for errors."
fi

# ----- AFTER ----------------------------------------------------------------
echo
echo "→ snapshotting row counts AFTER restore…"
snapshot AFTER

# ----- diff -----------------------------------------------------------------
echo
printf "%-15s %12s %12s %12s\n" "table" "before" "after" "delta"
printf "%-15s %12s %12s %12s\n" "-----" "------" "-----" "-----"
for t in "${TABLES[@]}"; do
  b="${BEFORE[$t]:-ERR}"
  a="${AFTER[$t]:-ERR}"
  if [[ "$b" =~ ^[0-9]+$ && "$a" =~ ^[0-9]+$ ]]; then
    d=$((a - b))
  else
    d="?"
  fi
  printf "%-15s %12s %12s %12s\n" "$t" "$b" "$a" "$d"
done

cat <<EOF

Restore finished (pg_restore rc=${RC}).
Next steps:
  1. Inspect the diff above — counts should match dump expectations.
  2. Sanity-check critical flows (login, list trips, view temperature log).
  3. Start the application services:
       docker compose -f ${COMPOSE_FILE} up -d api web
  4. Tail logs for 5 minutes:
       docker compose -f ${COMPOSE_FILE} logs --tail 200 -f api web
EOF

exit ${RC}
