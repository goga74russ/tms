#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# scripts/dr-drill.sh — full disaster-recovery drill orchestrator for TMS v2
# ----------------------------------------------------------------------------
# DR PLAN OVERVIEW
#   Targets (per docs/operations/pre-launch-checklist.md §10):
#     RTO = 4 hours   (max acceptable downtime after a disaster)
#     RPO = 24 hours  (max acceptable data loss — backups run daily at 03:00 UTC)
#
#   This drill exercises every link in the chain end-to-end and produces an
#   auditable markdown report. Run it weekly (cron: 0 1 * * 0). A green drill
#   is the only proof that the backup/restore pipeline actually works.
#
# WHAT IT DOES
#   1. Triggers a fresh production backup (scripts/backup-db.sh).
#   2. Verifies that the just-produced backup file is valid:
#        - exists and > 1KB
#        - gunzip --test passes
#        - pg_restore --list parses the dump's TOC (≥ 1 entry)
#   3. Spins up the staging stack (apps/api/docker-compose.test.yml).
#   4. Calls restore-db-to-staging.sh — restore latest backup to tms_test.
#   5. Applies latest migrations to ensure schema parity with HEAD.
#   6. Runs scripts/smoke-chain.mjs against the staging API (if API_URL given).
#   7. Generates a markdown report at /var/log/tms-dr-drills/<ts>.md.
#   8. Tears down staging unless KEEP_STAGING=1.
#   9. Exits 0 on full success, non-zero with reason otherwise.
#
# ENV
#   KEEP_STAGING=1                keep staging containers up after drill
#   SMOKE_API_URL                 override smoke-chain target (default skip)
#   SEED_PASSWORD                 required if SMOKE_API_URL set
#   DR_REPORT_DIR                 default /var/log/tms-dr-drills
#   SKIP_BACKUP=1                 use existing latest backup (faster reruns)
#   SKIP_MIGRATE=1                skip db:migrate step
#   SKIP_SMOKE=1                  skip smoke-chain step (default if no API_URL)
#
# CRON
#   0 1 * * 0 /opt/tms/scripts/dr-drill.sh >> /var/log/tms-dr-drills/cron.log 2>&1
# ----------------------------------------------------------------------------

set -uo pipefail

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

# ----- config ---------------------------------------------------------------
DR_REPORT_DIR="${DR_REPORT_DIR:-/var/log/tms-dr-drills}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/tms}"
STAGING_COMPOSE="${STAGING_COMPOSE:-${PROJECT_ROOT}/apps/api/docker-compose.test.yml}"
STAGING_CONTAINER="${STAGING_CONTAINER:-tms-test-postgres}"
STAGING_DB="${STAGING_DB:-tms_test}"
STAGING_USER="${STAGING_USER:-tms_test}"
STAGING_PASSWORD="${STAGING_PASSWORD:-tms_test}"
STAGING_HOST_PORT="${STAGING_HOST_PORT:-15432}"

TS="$(date -u +%Y%m%d-%H%M%S)"
REPORT_FILE="${DR_REPORT_DIR}/${TS}.md"
START_EPOCH="$(date +%s)"

mkdir -p "${DR_REPORT_DIR}"

# ----- helpers --------------------------------------------------------------
declare -a STEPS_OK STEPS_FAIL
ANOMALIES=""

log() { printf '%s dr-drill: %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"; }

record_ok()   { STEPS_OK+=("$1"); log "OK   — $1"; }
record_fail() { STEPS_FAIL+=("$1: $2"); log "FAIL — $1: $2"; }

cleanup() {
  local rc=$?
  if [[ "${KEEP_STAGING:-0}" != "1" ]]; then
    log "tearing down staging stack…"
    docker compose -f "${STAGING_COMPOSE}" down -v >/dev/null 2>&1 || true
  else
    log "KEEP_STAGING=1 — leaving staging stack running on port ${STAGING_HOST_PORT}"
  fi
  exit $rc
}
trap cleanup EXIT

# ============================================================================
# Step 1 — fresh backup
# ============================================================================
log "STEP 1: fresh backup-db.sh"
BACKUP_BEFORE_COUNT="$(find "${BACKUP_DIR}" -maxdepth 1 -name "tms-${POSTGRES_DB}-*.dump.gz" 2>/dev/null | wc -l)"

if [[ "${SKIP_BACKUP:-0}" == "1" ]]; then
  log "SKIP_BACKUP=1 — using latest existing backup"
  record_ok "backup (skipped, reusing latest)"
else
  if bash "${SCRIPT_DIR}/backup-db.sh"; then
    record_ok "fresh backup produced"
  else
    record_fail "step1-backup" "backup-db.sh exited non-zero"
  fi
fi

# Find the newest backup (just produced, or latest existing if skipped)
LATEST_DUMP="$(find "${BACKUP_DIR}" -maxdepth 1 -type f \
  -name "tms-${POSTGRES_DB}-*.dump.gz" -printf '%T@ %p\n' 2>/dev/null \
  | sort -nr | head -n 1 | awk '{print $2}')"

if [[ -z "${LATEST_DUMP}" || ! -f "${LATEST_DUMP}" ]]; then
  record_fail "step1-backup" "no backup file located"
fi

# ============================================================================
# Step 2 — verify backup
# ============================================================================
log "STEP 2: verify backup integrity"

BACKUP_SIZE=0
BACKUP_HUMAN="?"
TOC_ENTRIES=0

if [[ -f "${LATEST_DUMP}" ]]; then
  BACKUP_SIZE="$(stat -c%s "${LATEST_DUMP}" 2>/dev/null || stat -f%z "${LATEST_DUMP}")"
  BACKUP_HUMAN="$(du -h "${LATEST_DUMP}" | cut -f1)"

  if [[ "${BACKUP_SIZE}" -lt 1024 ]]; then
    record_fail "step2-verify" "size ${BACKUP_SIZE} < 1024 bytes"
  elif ! gunzip -t "${LATEST_DUMP}" 2>/dev/null; then
    record_fail "step2-verify" "gunzip --test failed"
  else
    # pg_restore --list via temporary container (avoids host pg_restore version mismatch)
    set +e
    TOC_ENTRIES="$(gunzip -c "${LATEST_DUMP}" \
      | docker run --rm -i postgres:16-alpine pg_restore --list 2>/dev/null \
      | grep -c -E '^[0-9]+;' || true)"
    set -e
    if [[ "${TOC_ENTRIES}" -lt 1 ]]; then
      record_fail "step2-verify" "pg_restore --list returned 0 entries"
    else
      record_ok "backup verified (${BACKUP_HUMAN}, ${TOC_ENTRIES} TOC entries)"
    fi
  fi
fi

# ============================================================================
# Step 3 — staging up
# ============================================================================
log "STEP 3: bring up staging stack"
if docker compose -f "${STAGING_COMPOSE}" up -d >/dev/null 2>&1; then
  # Wait for health
  STAGING_READY=0
  for i in {1..30}; do
    if docker exec "${STAGING_CONTAINER}" pg_isready -U "${STAGING_USER}" >/dev/null 2>&1; then
      STAGING_READY=1
      break
    fi
    sleep 2
  done
  if [[ "${STAGING_READY}" -eq 1 ]]; then
    record_ok "staging stack ready (port ${STAGING_HOST_PORT})"
  else
    record_fail "step3-staging" "postgres did not become ready in 60s"
  fi
else
  record_fail "step3-staging" "docker compose up failed"
fi

# ============================================================================
# Step 4 — restore to staging
# ============================================================================
log "STEP 4: restore-db-to-staging.sh"
RESTORE_LOG="$(mktemp)"
if BACKUP_DIR="${BACKUP_DIR}" \
   STAGING_COMPOSE="${STAGING_COMPOSE}" \
   STAGING_CONTAINER="${STAGING_CONTAINER}" \
   STAGING_DB="${STAGING_DB}" \
   STAGING_USER="${STAGING_USER}" \
   STAGING_PASSWORD="${STAGING_PASSWORD}" \
   bash "${SCRIPT_DIR}/restore-db-to-staging.sh" 2>&1 | tee "${RESTORE_LOG}"; then
  record_ok "restore-db-to-staging.sh succeeded"
else
  record_fail "step4-restore" "restore-db-to-staging.sh exited non-zero"
fi

# Capture row counts from restore output
ROW_REPORT="$(awk '/^  [a-z_]+ +[0-9ERR]+ +[0-9ERR]+/{print}' "${RESTORE_LOG}" || true)"

# ============================================================================
# Step 5 — apply latest migrations (schema parity with HEAD)
# ============================================================================
log "STEP 5: apply migrations to staging"
if [[ "${SKIP_MIGRATE:-0}" == "1" ]]; then
  record_ok "migrations (skipped via SKIP_MIGRATE=1)"
else
  STAGING_DB_URL="postgresql://${STAGING_USER}:${STAGING_PASSWORD}@localhost:${STAGING_HOST_PORT}/${STAGING_DB}"
  if command -v pnpm >/dev/null; then
    if ( cd "${PROJECT_ROOT}" && DATABASE_URL="${STAGING_DB_URL}" \
         pnpm --filter @tms/api db:migrate ) >/dev/null 2>&1; then
      record_ok "migrations applied"
    else
      record_fail "step5-migrate" "pnpm db:migrate failed against staging"
      ANOMALIES="${ANOMALIES}\n- migrations failed — likely schema drift between backup and HEAD"
    fi
  else
    record_fail "step5-migrate" "pnpm not in PATH (cannot apply migrations)"
  fi
fi

# ============================================================================
# Step 6 — smoke chain
# ============================================================================
log "STEP 6: smoke-chain.mjs"
SMOKE_RESULT="skipped (set SMOKE_API_URL + SEED_PASSWORD to run)"
if [[ "${SKIP_SMOKE:-0}" == "1" ]]; then
  record_ok "smoke (skipped via SKIP_SMOKE=1)"
elif [[ -z "${SMOKE_API_URL:-}" ]]; then
  record_ok "smoke (skipped — no SMOKE_API_URL configured)"
elif [[ -z "${SEED_PASSWORD:-}" ]]; then
  record_fail "step6-smoke" "SMOKE_API_URL set but SEED_PASSWORD missing"
else
  if API_URL="${SMOKE_API_URL}" SEED_PASSWORD="${SEED_PASSWORD}" \
     node "${SCRIPT_DIR}/smoke-chain.mjs"; then
    SMOKE_RESULT="PASS"
    record_ok "smoke chain passed"
  else
    SMOKE_RESULT="FAIL"
    record_fail "step6-smoke" "smoke-chain.mjs exited non-zero"
  fi
fi

# ============================================================================
# Generate report
# ============================================================================
ELAPSED=$(( $(date +%s) - START_EPOCH ))
FAIL_COUNT="${#STEPS_FAIL[@]}"
OK_COUNT="${#STEPS_OK[@]}"
OVERALL="PASS"
[[ "${FAIL_COUNT}" -gt 0 ]] && OVERALL="FAIL"

{
  echo "# TMS DR drill — ${TS}"
  echo
  echo "- **Overall**: ${OVERALL}"
  echo "- **Duration**: ${ELAPSED}s"
  echo "- **Host**: $(hostname)"
  echo "- **Started (UTC)**: $(date -u -d "@${START_EPOCH}" +'%Y-%m-%dT%H:%M:%SZ' 2>/dev/null \
                              || date -u -r "${START_EPOCH}" +'%Y-%m-%dT%H:%M:%SZ')"
  echo "- **RTO target**: 4h   **RPO target**: 24h"
  echo
  echo "## Backup"
  echo
  echo "- File: \`${LATEST_DUMP:-<none>}\`"
  echo "- Size: ${BACKUP_HUMAN} (${BACKUP_SIZE} bytes)"
  echo "- TOC entries: ${TOC_ENTRIES}"
  echo
  echo "## Row counts (staging after restore)"
  echo
  echo '```'
  echo "${ROW_REPORT:-<no row data captured>}"
  echo '```'
  echo
  echo "## Smoke chain"
  echo
  echo "- Result: ${SMOKE_RESULT}"
  [[ -n "${SMOKE_API_URL:-}" ]] && echo "- Target: ${SMOKE_API_URL}"
  echo
  echo "## Steps OK (${OK_COUNT})"
  echo
  for s in "${STEPS_OK[@]:-}"; do echo "- ${s}"; done
  echo
  echo "## Steps FAIL (${FAIL_COUNT})"
  echo
  if [[ "${FAIL_COUNT}" -eq 0 ]]; then
    echo "_none_"
  else
    for s in "${STEPS_FAIL[@]}"; do echo "- ${s}"; done
  fi
  echo
  echo "## Anomalies"
  echo
  if [[ -z "${ANOMALIES}" ]]; then
    echo "_none observed_"
  else
    printf '%b\n' "${ANOMALIES}"
  fi
  echo
  echo "---"
  echo "_Generated by scripts/dr-drill.sh_"
} > "${REPORT_FILE}"

log "report written → ${REPORT_FILE}"

# Cleanup will run via trap
if [[ "${FAIL_COUNT}" -gt 0 ]]; then
  log "DRILL FAILED — ${FAIL_COUNT} failing step(s); see ${REPORT_FILE}"
  exit 1
fi

log "DRILL PASSED — ${ELAPSED}s, ${OK_COUNT} steps OK"
exit 0
