#!/bin/bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/tms}"
BACKUP_FILE="${1:-}"

if [ -z "$BACKUP_FILE" ]; then
    echo "Usage: bash scripts/rollback-prod.sh backups/pre-deploy-YYYYMMDD-HHMMSS.dump"
    exit 1
fi

cd "$PROJECT_DIR"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Backup not found: $BACKUP_FILE"
    exit 1
fi

compose() {
    docker compose -f docker-compose.prod.yml "$@"
}

echo "Stopping application services..."
compose stop nginx web api

echo "Restoring database from $BACKUP_FILE..."
cat "$BACKUP_FILE" | compose exec -T postgres pg_restore \
    -U "${POSTGRES_USER:-tms}" \
    -d "${POSTGRES_DB:-tms}" \
    --clean \
    --if-exists \
    --no-owner

echo "Starting application services..."
compose up -d api web nginx

echo "Checking readiness..."
compose exec -T api node -e "fetch('http://127.0.0.1:4000/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

echo "Rollback complete."
