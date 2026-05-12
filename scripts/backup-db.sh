#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# scripts/backup-db.sh — production Postgres backup for TMS v2
# ----------------------------------------------------------------------------
# WHAT IT DOES
#   1. Loads .env from project root.
#   2. Dumps the Postgres database (custom format, no-owner, no-acl) from the
#      `postgres` container of docker-compose.prod.yml.
#   3. gzip-compresses and writes to /var/backups/tms/.
#   4. (Optional) Uploads to S3 / MinIO if BACKUP_S3_BUCKET is set.
#   5. Logs every step to /var/log/tms-backup.log AND syslog.
#   6. Exits non-zero on pg_dump failure or implausibly small dump (< 1KB).
#
# CRON
#   chmod +x /opt/tms/scripts/backup-db.sh
#   crontab -e
#   0 3 * * * /opt/tms/scripts/backup-db.sh >> /var/log/tms-backup.log 2>&1
#   # 03:00 UTC == 06:00 MSK — outside business hours, low-traffic window.
#
# PREREQUISITES
#   - docker + docker compose v2 plugin
#   - aws-cli v2  (for S3)  OR  mc (for MinIO)
#   - logger (util-linux) for syslog
#   - .env present in project root with POSTGRES_DB / POSTGRES_USER / POSTGRES_PASSWORD
# ----------------------------------------------------------------------------

set -euo pipefail

# ----- locate project root + load env --------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "FATAL: .env not found at ${ENV_FILE}" >&2
  exit 2
fi

# shellcheck disable=SC1090
set -a; source "${ENV_FILE}"; set +a

# ----- required vars --------------------------------------------------------
: "${POSTGRES_DB:?POSTGRES_DB must be set in .env}"
: "${POSTGRES_USER:?POSTGRES_USER must be set in .env}"
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set in .env}"

# ----- config (override via env if needed) ---------------------------------
BACKUP_DIR="${BACKUP_DIR:-/var/backups/tms}"
LOG_FILE="${BACKUP_LOG_FILE:-/var/log/tms-backup.log}"
COMPOSE_FILE="${COMPOSE_FILE:-${PROJECT_ROOT}/docker-compose.prod.yml}"
TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
DUMP_NAME="tms-${POSTGRES_DB}-${TIMESTAMP}.dump"
DUMP_PATH="${BACKUP_DIR}/${DUMP_NAME}.gz"
MIN_DUMP_SIZE_BYTES=1024  # < 1KB == something is wrong

# ----- logging helpers -----------------------------------------------------
log() {
  local msg
  msg="$(date -u +'%Y-%m-%dT%H:%M:%SZ') backup-db: $*"
  echo "${msg}"
  echo "${msg}" >> "${LOG_FILE}" 2>/dev/null || true
  command -v logger >/dev/null && logger -t tms-backup "$*" || true
}

die() {
  log "FATAL: $*"
  exit 1
}

# ----- pre-flight ----------------------------------------------------------
mkdir -p "${BACKUP_DIR}"
touch "${LOG_FILE}" 2>/dev/null || true

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  die "compose file not found: ${COMPOSE_FILE}"
fi

if ! command -v docker >/dev/null; then
  die "docker not in PATH"
fi

log "starting backup → ${DUMP_PATH}"

# ----- dump + gzip ----------------------------------------------------------
# We let pg_dump errors propagate via PIPESTATUS.
set +e
docker compose -f "${COMPOSE_FILE}" exec -T postgres \
  pg_dump --format=custom --no-owner --no-acl \
          -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" \
  | gzip -9 > "${DUMP_PATH}"
PIPE_STATUS=("${PIPESTATUS[@]}")
set -e

if [[ "${PIPE_STATUS[0]}" -ne 0 ]]; then
  rm -f "${DUMP_PATH}"
  die "pg_dump failed (exit=${PIPE_STATUS[0]})"
fi
if [[ "${PIPE_STATUS[1]}" -ne 0 ]]; then
  rm -f "${DUMP_PATH}"
  die "gzip failed (exit=${PIPE_STATUS[1]})"
fi

# ----- sanity check size ---------------------------------------------------
ACTUAL_SIZE="$(stat -c%s "${DUMP_PATH}" 2>/dev/null || stat -f%z "${DUMP_PATH}")"
if [[ "${ACTUAL_SIZE}" -lt "${MIN_DUMP_SIZE_BYTES}" ]]; then
  rm -f "${DUMP_PATH}"
  die "dump suspiciously small: ${ACTUAL_SIZE} bytes (< ${MIN_DUMP_SIZE_BYTES})"
fi

log "local dump OK: $(du -h "${DUMP_PATH}" | cut -f1)"

# ----- optional offsite upload ---------------------------------------------
if [[ -n "${BACKUP_S3_BUCKET:-}" ]]; then
  PREFIX="${BACKUP_S3_PREFIX:-tms/postgres}"
  S3_URI="s3://${BACKUP_S3_BUCKET}/${PREFIX}/${DUMP_NAME}.gz"

  if command -v aws >/dev/null; then
    log "uploading via aws-cli → ${S3_URI}"
    aws s3 cp --no-progress "${DUMP_PATH}" "${S3_URI}" \
      || die "aws s3 cp failed"
  elif command -v mc >/dev/null; then
    # mc alias must already be configured (e.g. `mc alias set tmsbackups …`)
    log "uploading via mc → tmsbackups/${BACKUP_S3_BUCKET}/${PREFIX}/${DUMP_NAME}.gz"
    mc cp "${DUMP_PATH}" "tmsbackups/${BACKUP_S3_BUCKET}/${PREFIX}/${DUMP_NAME}.gz" \
      || die "mc cp failed"
  else
    die "BACKUP_S3_BUCKET set but neither aws nor mc found in PATH"
  fi
  log "offsite upload OK"
else
  log "BACKUP_S3_BUCKET not set — skipping offsite upload"
fi

# ----- retention (keep last 14 local) --------------------------------------
RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-14}"
find "${BACKUP_DIR}" -maxdepth 1 -name "tms-${POSTGRES_DB}-*.dump.gz" \
  -type f -mtime "+${RETAIN_DAYS}" -print -delete \
  | while read -r f; do log "pruned old backup: ${f}"; done

log "DONE — ${DUMP_PATH} (${ACTUAL_SIZE} bytes)"
exit 0
