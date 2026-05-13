#!/usr/bin/env bash
# ============================================================
# bootstrap-prod.sh — first-pilot deploy bootstrap for TransPult
# ============================================================
# Assumes a fresh Ubuntu 24.04 host with:
#   - Docker installed (Phase 1 already done)
#   - Outbound HTTPS to github.com + registry-1.docker.io
#
# Usage from a fresh server (one-shot):
#   curl -fsSL https://raw.githubusercontent.com/goga74russ/tms/<branch>/scripts/bootstrap-prod.sh | bash
#
# Idempotent: safe to re-run after partial failure.
# Generates strong secrets, writes .env, builds images, applies
# migrations, seeds initial admin, brings the stack up.
#
# After successful run, the admin password is printed to stdout
# (also persisted in /opt/transpult/.env as SEED_PASSWORD).
# ============================================================
set -euo pipefail

# Some hosts (e.g. Timeweb) block outbound 443 to github.com IPs
# (140.82.x.x) but still allow Fastly-fronted raw.githubusercontent.com
# (185.199.x.x). We download a pre-archived tarball over raw URLs to
# sidestep this. Override SOURCE_TARBALL_URL if running elsewhere.
SOURCE_TARBALL_URL="${SOURCE_TARBALL_URL:-https://raw.githubusercontent.com/goga74russ/tms/claude/bootstrap-script-2026-05-13/scripts/dist/transpult-v0.1.2-pilot.tar.gz}"
INSTALL_DIR="${INSTALL_DIR:-/opt/transpult}"
PUBLIC_IP="${PUBLIC_IP:-$(curl -fsSL --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')}"

echo "============================================================"
echo "  TransPult bootstrap"
echo "  tarball:  $SOURCE_TARBALL_URL"
echo "  install:  $INSTALL_DIR"
echo "  ip:       $PUBLIC_IP"
echo "============================================================"

# --- 1. Download + extract source ---
mkdir -p "$(dirname "$INSTALL_DIR")"
if [ -d "$INSTALL_DIR/docker-compose.prod.yml" ] || [ -f "$INSTALL_DIR/docker-compose.prod.yml" ]; then
    echo "[1/8] Source уже в $INSTALL_DIR — пропускаю download"
    cd "$INSTALL_DIR"
else
    echo "[1/8] Downloading source tarball..."
    mkdir -p "$INSTALL_DIR"
    curl -fsSL --max-time 60 "$SOURCE_TARBALL_URL" \
        | tar -xz -C "$INSTALL_DIR" --strip-components=1
    cd "$INSTALL_DIR"
    echo "  → source extracted ($(ls | wc -l) entries)"
fi

# --- 2. Generate secrets (only if .env doesn't exist yet) ---
ENV_FILE="$INSTALL_DIR/.env"
if [ -f "$ENV_FILE" ]; then
    echo "[2/8] .env уже есть — оставляю существующее (передвинь его если нужно reset)"
else
    echo "[2/8] Generating strong secrets..."
    JWT_SECRET=$(openssl rand -hex 32)
    CREDENTIALS_KEY=$(openssl rand -hex 32)
    POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr '/+=' '__-' | head -c 28)
    REDIS_PASSWORD=$(openssl rand -base64 24 | tr '/+=' '__-' | head -c 28)
    MINIO_ROOT_PASSWORD=$(openssl rand -base64 24 | tr '/+=' '__-' | head -c 28)
    SEED_PASSWORD=$(openssl rand -base64 12 | tr '/+=' '__-' | head -c 16)
    YOOKASSA_WEBHOOK_SECRET=$(openssl rand -hex 32)

    cat > "$ENV_FILE" <<ENVEOF
# Generated $(date -Iseconds) by bootstrap-prod.sh on $(hostname)
TMS_PUBLIC_HOST=transpult.ru
TMS_PUBLIC_SCHEME=http
DOMAIN=transpult.ru
CORS_ORIGIN=http://transpult.ru,http://${PUBLIC_IP}
NEXT_PUBLIC_API_URL=http://transpult.ru/api
INTERNAL_API_URL=http://api:4000/api
COOKIE_SECURE=false
NGINX_CONF=./nginx/default.conf

POSTGRES_DB=tms
POSTGRES_USER=tms
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
DATABASE_URL=postgresql://tms:${POSTGRES_PASSWORD}@postgres:5432/tms

REDIS_PASSWORD=${REDIS_PASSWORD}
REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379

MINIO_IMAGE=minio/minio:RELEASE.2025-04-22T22-12-26Z
MINIO_ROOT_USER=transpult_minio
MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
S3_BUCKET=transpult
S3_REGION=ru-central-1
S3_PUBLIC_URL=http://transpult.ru/storage

JWT_SECRET=${JWT_SECRET}
CREDENTIALS_KEY=${CREDENTIALS_KEY}
YOOKASSA_WEBHOOK_SECRET=${YOOKASSA_WEBHOOK_SECRET}

RATE_LIMIT_MAX=500
RATE_LIMIT_WINDOW=1 minute
LOGIN_RATE_LIMIT_MAX=5
LOGIN_RATE_LIMIT_WINDOW=1 minute
ENABLE_API_DOCS=false
LOG_LEVEL=info
SEED_PASSWORD=${SEED_PASSWORD}

COMPANY_NAME=ИП Бардин Георгий Дмитриевич
COMPANY_INN=746003023587
COMPANY_KPP=
CARRIER_NAME=ИП Бардин Георгий Дмитриевич
CARRIER_INN=746003023587
CARRIER_KPP=
CARRIER_OGRNIP=326745600039073
CARRIER_ADDRESS=Челябинская область, Чебаркульский район, село Непряхино
CARRIER_PHONE=
CARRIER_BANK=ООО "Банк Точка"
CARRIER_BIK=044525104
CARRIER_ACCOUNT=40802810220000919838
CARRIER_CORR=30101810745374525104
NEXT_PUBLIC_CARRIER_NAME=ИП Бардин Георгий Дмитриевич
NEXT_PUBLIC_CARRIER_INN=746003023587
NEXT_PUBLIC_CARRIER_KPP=
NEXT_PUBLIC_CARRIER_ADDRESS=Челябинская область, Чебаркульский район, село Непряхино
NEXT_PUBLIC_CARRIER_BANK=ООО "Банк Точка"
NEXT_PUBLIC_CARRIER_BIK=044525104
NEXT_PUBLIC_CARRIER_ACCOUNT=40802810220000919838

FUEL_PRICE_PER_LITER=60
DRIVER_SALARY_PER_HOUR=350
AMORTIZATION_PER_KM=5
FUEL_NORM_PER_100KM=30
BASE_OPERATIONAL_COST=500
APP_TIMEZONE=Europe/Moscow
ENVEOF

    chmod 600 "$ENV_FILE"
    echo ""
    echo "============================================================"
    echo "  ⚠️  СОХРАНИ admin credentials:"
    echo "  Email:     admin@tms.local"
    echo "  Password:  ${SEED_PASSWORD}"
    echo "  (Также в ${ENV_FILE} как SEED_PASSWORD)"
    echo "============================================================"
    echo ""
fi

# --- 3. Pull base images ---
echo "[3/8] Pull base images (postgres / redis / minio / nginx)..."
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" pull postgres redis minio nginx

# --- 4. Build api + web ---
echo "[4/8] Build api + web (5-10 min, не Ctrl+C!)..."
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" build api web

# --- 5. Start datastores first ---
echo "[5/8] Starting postgres + redis + minio..."
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" up -d postgres redis minio

echo "      Ждём postgres healthcheck..."
for i in $(seq 1 60); do
    if docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" exec -T postgres pg_isready -U tms -d tms >/dev/null 2>&1; then
        echo "      postgres ready ✓"
        break
    fi
    sleep 2
done

# --- 6. Apply migrations ---
echo "[6/8] Applying migrations..."
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" run --rm api pnpm --filter @tms/api db:migrate

# --- 7. Seed initial admin ---
echo "[7/8] Seeding initial admin user..."
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" run --rm api pnpm --filter @tms/api db:seed

# --- 8. Bring up api + web + nginx ---
echo "[8/8] Starting api + web + nginx..."
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" up -d

echo "      Ждём stack health (~90s)..."
for i in $(seq 1 45); do
    if curl -sf http://localhost/api/health >/dev/null 2>&1; then
        echo "      api responding ✓"
        break
    fi
    sleep 2
done

# --- Final status ---
echo ""
echo "============================================================"
echo "  ✓ Bootstrap done"
echo "============================================================"
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" ps
echo ""
echo "Health check:"
curl -s http://localhost/api/health | head -c 500
echo ""
echo ""
SEED_PASSWORD_VALUE=$(grep '^SEED_PASSWORD=' "$ENV_FILE" | cut -d= -f2-)
echo "============================================================"
echo "  Open in browser:"
echo "    http://${PUBLIC_IP}"
echo "    http://transpult.ru  (once DNS прорастёт)"
echo ""
echo "  Login:"
echo "    Email:     admin@tms.local"
echo "    Password:  ${SEED_PASSWORD_VALUE}"
echo "============================================================"
