param(
    [switch]$SkipBuild,
    [switch]$SkipDockerDrills
)

$ErrorActionPreference = "Stop"

if (-not $SkipBuild) {
    corepack pnpm --filter @tms/shared build
    corepack pnpm --filter @tms/api build
    corepack pnpm --filter @tms/web build
    corepack pnpm --filter @tms/mobile typecheck
}

docker compose -f D:\Ai\TMS-prod\docker-compose.prod.yml ps
Invoke-RestMethod -Method Get -Uri http://localhost/api/health | ConvertTo-Json -Depth 4
Invoke-RestMethod -Method Get -Uri http://localhost/api/health/ready | ConvertTo-Json -Depth 4
Get-Content -Raw D:\Ai\TMS-prod\scripts\db-integrity-check.sql | docker compose -f D:\Ai\TMS-prod\docker-compose.prod.yml exec -T postgres psql -U tms -d tms -v ON_ERROR_STOP=1
D:\Ai\TMS-prod\scripts\mobile-smoke.ps1
D:\Ai\TMS-prod\scripts\multi-tenant-smoke.ps1
D:\Ai\TMS-prod\scripts\operational-core-smoke.ps1
Start-Sleep -Seconds 60
D:\Ai\TMS-prod\scripts\web-role-smoke.ps1

if (-not $SkipDockerDrills) {
    D:\Ai\TMS-prod\scripts\backup-restore-drill.ps1
}
