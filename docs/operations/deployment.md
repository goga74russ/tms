# Deployment

Updated: 2026-04-28

> **NOTE:** Snapshot from 2026-04-28. The compose stack has since grown to 7 services (api, web, postgres, redis, minio, nginx, certbot). For the current state see [`docs/operations/wave-summary.md`](wave-summary.md) and [`docs/operations/pre-launch-checklist.md`](pre-launch-checklist.md).

## Runtime

Production deployment is based on:

- `docker-compose.prod.yml`
- `deploy.sh`
- `nginx/default.conf`
- `nginx/default-ssl.conf`
- `scripts/rollback-prod.sh`

## Services

- PostgreSQL
- Redis
- MinIO
- API
- Web
- nginx
- certbot profile for SSL operations

## Deploy Flow

1. Ensure Docker and Docker Compose are available.
2. Ensure project files are present in `/opt/tms`.
3. Create `.env` if missing.
4. Build Docker images.
5. Start infrastructure services.
6. Ensure MinIO bucket exists.
7. Create a pre-migration database backup.
8. Apply SQL migrations.
9. Seed only when the database has no users.
10. Start API, Web, and nginx.
11. Check `/api/health`.
12. Check `/api/health/ready`.

## Rollback Flow

Use:

```bash
bash scripts/rollback-prod.sh backups/pre-deploy-YYYYMMDD-HHMMSS.dump
```

Rollback restores the database backup, starts app services, and checks readiness.

## Production Notes

- API and Web are exposed through nginx.
- API docs are disabled in production unless `ENABLE_API_DOCS=true`.
- Files are stored through MinIO/S3-compatible storage.
- `COOKIE_SECURE=false` is expected for HTTP-only IP deployments; HTTPS deployments should use secure cookies.



## Local v2 Startup

Use this flow for the Windows v2 sandbox in `D:\Ai\TMS-prod`:

```powershell
docker compose -f D:\Ai\TMS-prod\docker-compose.prod.yml up -d --build
powershell -ExecutionPolicy Bypass -File D:\Ai\TMS-prod\scripts\apply-local-migrations.ps1
powershell -ExecutionPolicy Bypass -File D:\Ai\TMS-prod\scripts\seed-local.ps1
```

Then verify:

```powershell
docker compose -f D:\Ai\TMS-prod\docker-compose.prod.yml ps
Invoke-WebRequest -UseBasicParsing http://localhost/api/health
```

Redis is configured with `--maxmemory-policy noeviction` because BullMQ queues must not silently evict jobs or locks under memory pressure.

Seed creates baseline users such as `admin@tms.local`, `logist@tms.local`, `dispatcher@tms.local`, and driver accounts. The shared seed password is stored only in local `.env` as `SEED_PASSWORD`.

## Local Docker Cleanup - 2026-04-28

Completed cleanup while preparing `D:\Ai\TMS-prod` as the v2 workspace:

- Removed old stopped TMS compose projects: `tms`, `tms-e2e`, `tms-e2e-fresh`.
- Removed old TMS volumes for dev/e2e PostgreSQL, Redis, MinIO, and certbot data.
- Removed old TMS images: `tms-prod-*`, `tms-smoke-*`, `tms-e2e-*`, `tms-e2e-fresh-*`.
- Pruned Docker build cache.
- Left non-TMS projects untouched: `nostalgiaforinfinity` and `platform`.

Current v2 startup should use this folder and its local `.env`:

```powershell
docker compose -f D:\Ai\TMS-prod\docker-compose.prod.yml up -d --build
```




