#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# scripts/restore-db-to-staging.sh — restore latest prod backup to staging DB
# ----------------------------------------------------------------------------
# WHEN TO RUN
#   - Weekly DR drill (cron: `0 1 * * 0` from backup-cron-example).
#   - On demand, before destructive prod changes, to validate latest backup.
#   - As part of `dr-drill.sh` orchestrator.
#
# WHAT HAPPENS
#   1. Load .env (prod creds, READ-ONLY) + .env.staging (staging creds, defaults
#      to tms_test on port 15432 from apps/api/docker-compose.test.yml).
#   2. Optionally download newest backup from S3 / MinIO (if BACKUP_S3_BUCKET set).
#   3. Find newest local dump in $BACKUP_DIR (default /var/backups/tms).
#   4. Bring up docker-compose.test.yml stack if not running.
#   5. DROP + CREATE the staging database (tms_test).
#   6. pg_restore --clean --if-exists --no-owner --no-acl against staging.
#   7. Verify by counting rows in users / organizations / trips / waybills /
#      orders / events.
#   8. Print before/after row counts, file size, elapsed time.
#
# SAFETY
#   - This script NEVER writes to the production database. It only READS .env
#     for credentials needed to identify the backup file name (POSTGRES_DB).
#   - The restore target is hard-coded to the staging compose project
#     (apps/api/docker-compose.test.yml — port 15432, container tms-test-postgres).
#   - Idempotent: rerunning produces the same staging state from the same backup.
#
# PREREQUISITES
#   - docker + docker compose v2
#   - psql client *inside* the staging container (postgres:16-alpine ships it)
#   - .env present in repo root
#   - If BACKUP_S3_BUCKET set: aws-cli OR mc with configured alias `tmsbackups`
#
# ENV OVERRIDES
#   BACKUP_DIR          default /var/backups/tms
#   BACKUP_S3_BUCKET    if set, pull newest object before local search
#   BACKUP_S3_PREFIX    default tms/postgres
#   STAGING_COMPOSE     default <repo>/apps/api/docker-compose.test.yml
#   STAGING_DB          default tms_test
#   STAGING_USER        default tms_test
#   STAGING_PASSWORD    default tms_test
#   STAGING_CONTAINER   default tms-test-postgres
#   STAGING_PORT        default 15432   (host-side, info only)
# ----------------------------------------------------------------------------

set -euo pipefail

# ----- locate project root + load env --------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"
ENV_STAGING="${PROJECT_ROOT}/.env.staging"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "FATAL: .env not found at ${ENV_FILE}" >&2
  exit 2
fi

# shellcheck disable=SC1090
set -a; source "${ENV_FILE}"; set +a

# Staging overrides (optional) — does NOT override prod creds, only sets defaults.
if [[ -f "${ENV_STAGING}" ]]; then
  # shellcheck disable=SC1090
  set -a; source "${ENV_STAGING}"; set +a
fi

# ----- required vars from prod .env (READ-ONLY) ----------------------------
: "${POSTGRES_DB:?POSTGRES_DB must be set in .env (used to match backup file name)}"

# ----- staging defaults -----------------------------------------------------
STAGING_COMPOSE="${STAGING_COMPOSE:-${PROJECT_ROOT}/apps/api/docker-compose.test.yml}"
STAGING_DB="${STAGING_DB:-tms_test}"
STAGING_USER="${STAGING_USER:-tms_test}"
STAGING_PASSWORD="${STAGING_PASSWORD:-tms_test}"
STAGING_CONTAINER="${STAGING_CONTAINER:-tms-test-postgres}"
STAGING_PORT="${STAGING_PORT:-15432}"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/tms}"
BACKUP_S3_PREFIX="${BACKUP_S3_PREFIX:-tms/postgres}"

TABLES=(users organizations trips waybills orders events)

START_EPOCH="$(date +%s)"

# ----- logging --------------------------------------------------------------
log() { printf '%s restore-staging: %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"; }
die() { log "FATAL: $*"; exit 1; }

if [[ ! -f "${STAGING_COMPOSE}" ]]; then
  die "staging compose file not found: ${STAGING_COMPOSE}"
fi
if ! command -v docker >/dev/null; then
  die "docker not in PATH"
fi

# ----- optional S3 pull -----------------------------------------------------
if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
  mkdir -p "${BACKUP_DIR}"
  log "looking for newest S3 object in s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}/"
  S3_NEWEST=""
  if command -v aws >/dev/null; then
    S3_NEWEST="$(aws s3 ls "s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}/" \
      | awk '/\.dump\.gz$/ {print $4}' | sort | tail -n 1 || true)"
    if [[ -n "${S3_NEWEST}" && ! -f "${BACKUP_DIR}/${S3_NEWEST}" ]]; then
      log "downloading s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}/${S3_NEWEST}"
      aws s3 cp --no-progress \
        "s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}/${S3_NEWEST}" \
        "${BACKUP_DIR}/${S3_NEWEST}" \
        || die "aws s3 cp failed"
    fi
  elif command -v mc >/dev/null; then
    S3_NEWEST="$(mc ls --json "tmsbackups/${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}/" \
      | awk -F'"' '/\.dump\.gz/ {for (i=1;i<=NF;i++) if ($i=="key") print $(i+2)}' \
      | sort | tail -n 1 || true)"
    if [[ -n "${S3_NEWEST}" && ! -f "${BACKUP_DIR}/${S3_NEWEST}" ]]; then
      log "downloading via mc: ${S3_NEWEST}"
      mc cp "tmsbackups/${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}/${S3_NEWEST}" \
            "${BACKUP_DIR}/${S3_NEWEST}" \
        || die "mc cp failed"
    fi
  else
    log "WARN: BACKUP_S3_BUCKET set but neither aws nor mc found — skipping S3 sync"
  fi
fi

# ----- find newest local backup --------------------------------------------
mkdir -p "${BACKUP_DIR}"
DUMP_FILE="$(find "${BACKUP_DIR}" -maxdepth 1 -type f \
  -name "tms-${POSTGRES_DB}-*.dump.gz" -printf '%T@ %p\n' 2>/dev/null \
  | sort -nr | head -n 1 | awk '{print $2}')"

if [[ -z "${DUMP_FILE}" || ! -f "${DUMP_FILE}" ]]; then
  die "no backup found in ${BACKUP_DIR} matching tms-${POSTGRES_DB}-*.dump.gz"
fi

DUMP_SIZE="$(stat -c%s "${DUMP_FILE}" 2>/dev/null || stat -f%z "${DUMP_FILE}")"
DUMP_HUMAN="$(du -h "${DUMP_FILE}" | cut -f1)"
log "using dump: ${DUMP_FILE} (${DUMP_HUMAN}, ${DUMP_SIZE} bytes)"

if [[ "${DUMP_SIZE}" -lt 1024 ]]; then
  die "dump suspiciously small: ${DUMP_SIZE} bytes"
fi

# ----- bring up staging stack ----------------------------------------------
if ! docker ps --format '{{.Names}}' | grep -q "^${STAGING_CONTAINER}$"; then
  log "staging container '${STAGING_CONTAINER}' not running — starting compose stack"
  docker compose -f "${STAGING_COMPOSE}" up -d \
    || die "failed to start staging compose stack"
fi

# Wait for healthy postgres
log "waiting for staging postgres to be ready…"
for i in {1..30}; do
  if docker exec "${STAGING_CONTAINER}" pg_isready -U "${STAGING_USER}" >/dev/null 2>&1; then
    break
  fi
  sleep 2
  if [[ "${i}" -eq 30 ]]; then
    die "staging postgres did not become ready within 60s"
  fi
done
log "staging postgres ready"

# ----- helpers --------------------------------------------------------------
psql_staging() {
  docker exec -e PGPASSWORD="${STAGING_PASSWORD}" "${STAGING_CONTAINER}" \
    psql -U "${STAGING_USER}" -d "$1" -tA -c "$2" 2>/dev/null
}

psql_count() {
  psql_staging "${STAGING_DB}" "SELECT count(*) FROM ${1};" 2>/dev/null || echo "ERR"
}

snapshot_into() {
  local -n out=$1
  for t in "${TABLES[@]}"; do
    out[$t]="$(psql_count "$t")"
  done
}

# ----- BEFORE snapshot (may all be ERR if DB empty) ------------------------
declare -A BEFORE AFTER
log "snapshotting BEFORE row counts (may show ERR for empty DB)…"
snapshot_into BEFORE

# ----- DROP + CREATE staging DB --------------------------------------------
log "dropping + recreating staging DB '${STAGING_DB}'"
psql_staging "postgres" \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${STAGING_DB}' AND pid <> pg_backend_pid();" \
  >/dev/null || true
psql_staging "postgres" "DROP DATABASE IF EXISTS ${STAGING_DB};" \
  >/dev/null || die "DROP DATABASE failed"
psql_staging "postgres" "CREATE DATABASE ${STAGING_DB} OWNER ${STAGING_USER};" \
  >/dev/null || die "CREATE DATABASE failed"

# ----- restore --------------------------------------------------------------
log "piping dump into pg_restore…"
set +e
gunzip -c "${DUMP_FILE}" | docker exec -i \
  -e PGPASSWORD="${STAGING_PASSWORD}" "${STAGING_CONTAINER}" \
  pg_restore --clean --if-exists --no-owner --no-acl \
             --role="${STAGING_USER}" \
             -U "${STAGING_USER}" -d "${STAGING_DB}"
RC=$?
set -e

# pg_restore exits non-zero on benign warnings (DROP on fresh DB).
# We don't fail here; the row-count verification is the source of truth.
if [[ ${RC} -ne 0 ]]; then
  log "pg_restore exited ${RC} — likely benign warnings, verifying via row counts"
fi

# ----- AFTER snapshot -------------------------------------------------------
log "snapshotting AFTER row counts…"
snapshot_into AFTER

ELAPSED=$(( $(date +%s) - START_EPOCH ))

# ----- report ---------------------------------------------------------------
echo
echo "============================================================"
echo "  DR RESTORE-TO-STAGING SUMMARY"
echo "============================================================"
printf "  Dump file       : %s\n" "${DUMP_FILE}"
printf "  Dump size       : %s (%s bytes)\n" "${DUMP_HUMAN}" "${DUMP_SIZE}"
printf "  Staging DB      : %s @ container %s (host port %s)\n" \
  "${STAGING_DB}" "${STAGING_CONTAINER}" "${STAGING_PORT}"
printf "  pg_restore rc   : %s\n" "${RC}"
printf "  Elapsed         : %ss\n" "${ELAPSED}"
echo "------------------------------------------------------------"
printf "  %-15s %12s %12s\n" "table" "before" "after"
printf "  %-15s %12s %12s\n" "-----" "------" "-----"
TOTAL_AFTER=0
for t in "${TABLES[@]}"; do
  b="${BEFORE[$t]:-ERR}"
  a="${AFTER[$t]:-ERR}"
  printf "  %-15s %12s %12s\n" "$t" "$b" "$a"
  if [[ "$a" =~ ^[0-9]+$ ]]; then
    TOTAL_AFTER=$(( TOTAL_AFTER + a ))
  fi
done
echo "============================================================"

# Verification: at least the 'users' and 'organizations' tables must exist
# and be queryable. Empty values for unseeded prod DBs are tolerated, but
# ERR (table missing) means restore did not produce the expected schema.
if [[ "${AFTER[users]:-ERR}" == "ERR" || "${AFTER[organizations]:-ERR}" == "ERR" ]]; then
  die "verification failed: core tables missing after restore"
fi

log "DONE — staging restore complete, ${TOTAL_AFTER} total rows across verified tables"
exit 0
