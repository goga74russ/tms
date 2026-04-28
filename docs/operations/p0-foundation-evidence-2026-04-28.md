# P0 Foundation Evidence - 2026-04-28

Scope: free foundation hardening for the v2 box: CI/static gates, local release runner, health/readiness, database integrity, mobile sync smoke, multi-tenant evidence, and backup/restore drill.

## Automation Added

| Artifact | Purpose |
| --- | --- |
| `.github/workflows/p0-gate.yml` | GitHub Actions build/typecheck/compose-config gate for push and PR to `main` |
| `scripts/p0-local.ps1` | Local P0 release-gate runner |
| `scripts/multi-tenant-smoke.ps1` | API-level organization isolation smoke |
| `scripts/backup-restore-drill.ps1` | PostgreSQL schema backup and scratch restore drill |

## Static / Build Gates

| Check | Result |
| --- | --- |
| `corepack pnpm --filter @tms/shared build` | passed |
| `corepack pnpm --filter @tms/api build` | passed |
| `corepack pnpm --filter @tms/web build` | passed |
| `corepack pnpm --filter @tms/mobile typecheck` | passed |
| `docker compose --env-file .env.example -f docker-compose.prod.yml config --quiet` | passed |

## Runtime Gates

| Check | Result |
| --- | --- |
| `docker compose ps` | postgres, redis, minio, api, web, nginx healthy |
| `GET http://localhost/api/health` | `status=ok` |
| `GET http://localhost/api/health/ready` | `status=ok`, `db=true`, `redis=true` |
| `scripts/db-integrity-check.sql` | 10 checks, all `violation_count = 0` |

## Mobile Gate

Command:

```powershell
D:\Ai\TMS-prod\scripts\mobile-smoke.ps1
```

Result: login ok, profile ok, non-empty sync pull ok, checkpoint push ok, trip completion push ok.

## Multi-Tenant Gate

Command:

```powershell
D:\Ai\TMS-prod\scripts\multi-tenant-smoke.ps1
```

Result:

```json
{
  "tenantAOwnTripVisible": true,
  "tenantAForeignTripHidden": true,
  "tenantBOwnTripVisible": true,
  "tenantBForeignTripHidden": true,
  "tenantATrip": "P0-MT-A",
  "tenantBTrip": "P0-MT-B"
}
```

## Backup / Restore Gate

Command:

```powershell
D:\Ai\TMS-prod\scripts\backup-restore-drill.ps1
```

Result: schema dump created, scratch restore succeeded, restored table count = 42.

## Remaining P0-Class Risk

- GitHub Actions has been added but still needs its first remote run result after push.
- Web role UAT still needs browser-level evidence, not only build/runtime API evidence.
- Android device/emulator gate remains mandatory before any mobile pilot/release.
