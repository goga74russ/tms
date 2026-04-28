# Smoke evidence - 2026-04-28

Scope: P0 verification after Russian mojibake cleanup and Docker rebuild.

## Encoding scan

Command: Node scan over source/docs/config files for replacement characters and common UTF-8/CP1251/CP1252 mojibake patterns.

Result: `files 0`.

## Package checks

| Check | Result |
| --- | --- |
| `corepack pnpm --filter @tms/shared build` | passed |
| `corepack pnpm --filter @tms/api build` | passed |
| `corepack pnpm --filter @tms/web build` | passed |
| `corepack pnpm --filter @tms/mobile typecheck` | passed |

## Docker rebuild

Command: `docker compose -f D:\Ai\TMS-prod\docker-compose.prod.yml up -d --build`

Result: API and web images rebuilt successfully, stack restarted.

## Runtime smoke

| Check | Result |
| --- | --- |
| `docker compose ps` | postgres, redis, minio, api, web, nginx are healthy |
| `GET http://localhost/api/health` | 200 OK, `{"status":"ok","version":"1.0.0"}` |
| `GET http://localhost/` | 200 OK, login page HTML returned |

## Database integrity

Command: `scripts/db-integrity-check.sql` via postgres container.

Result: 10 checks, all `violation_count = 0`.
