#!/bin/bash
# ============================================================
# TransPult — prod deploy script (runs ON the prod server).
#
# Usage (on prod host 135.106.152.23):
#   cd /opt/transpult && bash scripts/deploy.sh
#
# Typical local trigger (from dev box):
#   pwsh scripts/deploy.ps1                          # PowerShell wrapper
#   ssh transpult@host 'cd /opt/transpult && bash scripts/deploy.sh'
#
# What it does:
#   1. git pull --ff-only
#   2. apply all *.sql migrations that aren't yet in tms_schema_migrations
#   3. docker compose up -d --build api web
#   4. health-check + grep AI flag state from api logs
#
# fail-fast on any error; idempotent (re-running on clean state is a no-op).
# ============================================================
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/transpult}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DB_USER="${POSTGRES_USER:-tms}"
DB_NAME="${POSTGRES_DB:-tms}"

cd "$PROJECT_DIR"

compose() {
    docker compose -f "$COMPOSE_FILE" "$@"
}

psql_exec() {
    compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" "$@"
}

echo "==[1/6]== Pending commits (before pull)"
git fetch origin main
BEFORE_SHA=$(git rev-parse HEAD)
echo "Local HEAD : $BEFORE_SHA"
echo "Origin HEAD: $(git rev-parse origin/main)"
echo "--- diff ---"
git log --oneline HEAD..origin/main || true
echo "--- files ---"
git diff --stat HEAD..origin/main || true

echo ""
echo "==[2/6]== git pull --ff-only"
git pull --ff-only
AFTER_SHA=$(git rev-parse HEAD)
echo "Now HEAD: $AFTER_SHA"

if [ "$BEFORE_SHA" = "$AFTER_SHA" ]; then
    echo "(no new commits — code already in sync, will still re-check migrations + rebuild containers)"
fi

echo ""
echo "==[3/6]== Applying pending migrations"
# Атомарность: правила в docs/architecture/migrations.md.
# Каждый *.sql должен оборачивать содержимое в BEGIN/COMMIT, тогда
# psql -v ON_ERROR_STOP=1 откатит всё на сбое и тэг не запишется.
#
# 0000_full_schema (initial schema bootstrap) обычно пропускается — на
# проде схема уже накатана. На чистом dev/staging — задайте
# `ALLOW_INITIAL_SCHEMA=true` чтобы применить и его (T-49).
psql_exec -v ON_ERROR_STOP=1 -c "CREATE TABLE IF NOT EXISTS tms_schema_migrations (tag TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());" >/dev/null
APPLIED_TAGS=$(psql_exec -t -A -c "SELECT tag FROM tms_schema_migrations;" || true)

ALLOW_INITIAL="${ALLOW_INITIAL_SCHEMA:-false}"

for sql_file in $(ls apps/api/drizzle/*.sql 2>/dev/null | sort); do
    tag=$(basename "$sql_file" .sql)
    if [ "$tag" = "0000_full_schema" ] && [ "$ALLOW_INITIAL" != "true" ]; then
        echo "  [skip] $tag (initial schema — pass ALLOW_INITIAL_SCHEMA=true to apply)"
        continue
    fi
    if echo "$APPLIED_TAGS" | grep -qx "$tag"; then
        echo "  [skip] $tag (already applied)"
        continue
    fi
    echo "  [apply] $tag"
    psql_exec -v ON_ERROR_STOP=1 < "$sql_file"
    psql_exec -v ON_ERROR_STOP=1 -c "INSERT INTO tms_schema_migrations (tag) VALUES ('$tag') ON CONFLICT DO NOTHING;" >/dev/null
done

echo ""
echo "==[4/6]== Rebuild api + web containers"
compose up -d --build api web

# nginx кэширует upstream-IP пересозданных api/web (docker DNS) → после recreate
# проксирует на старый IP и отдаёт 502 Bad Gateway. Перезапуск nginx форсит
# повторный резолв. Без этого деплой проходит, но прод отдаёт 502 клиентам.
echo "--- restart nginx (re-resolve upstream после recreate) ---"
compose restart nginx

echo ""
echo "==[5/6]== Wait for /api/health"
HEALTH_OK=0
for i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 3
    # ВАЖНО: через https (-k), не http — http даёт 301→https, и `curl -f` его не
    # считает ошибкой (ложный «Health OK», маскирует 502 на реальном api-роуте).
    if curl -fskS https://localhost/api/health >/dev/null 2>&1; then
        HEALTH_OK=1
        echo "Health OK after ${i} attempt(s)"
        break
    fi
done

if [ $HEALTH_OK -eq 0 ]; then
    echo "!! Health check FAILED — printing last 50 api logs"
    compose logs --tail 50 api
    exit 1
fi

echo ""
echo "==[6/6]== Post-deploy verification"
echo "--- AI copilot flag state (expect: NOT registered) ---"
compose logs --tail 100 api 2>&1 | grep -i copilot | tail -5 || echo "(no copilot log lines)"

echo ""
echo "--- /api/health response ---"
curl -fsS http://localhost/api/health
echo ""

echo ""
echo "✅ Deploy complete."
echo "    Was: $BEFORE_SHA"
echo "    Now: $AFTER_SHA"
