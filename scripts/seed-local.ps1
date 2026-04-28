param(
    [string]$ComposeFile = "D:\Ai\TMS-prod\docker-compose.prod.yml",
    [string]$EnvFile = "D:\Ai\TMS-prod\.env",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $EnvFile)) {
    throw ".env file not found: $EnvFile"
}

$seedLine = Select-String -Path $EnvFile -Pattern '^SEED_PASSWORD=' | Select-Object -First 1
if (-not $seedLine) {
    throw "SEED_PASSWORD is missing in $EnvFile"
}
$seedPassword = $seedLine.Line -replace '^SEED_PASSWORD=', ''

$userCount = "SELECT COUNT(*) FROM users;" | docker compose -f $ComposeFile exec -T postgres psql -U tms -d tms -t -A
if ($LASTEXITCODE -ne 0) {
    throw "Failed to query users table"
}
$userCount = [int](($userCount -join "`n").Trim())

if ($userCount -gt 0 -and -not $Force) {
    Write-Host "Skipping seed: users table already has $userCount rows. Use -Force to seed anyway."
    exit 0
}

docker compose -f $ComposeFile run --rm -e SEED_PASSWORD=$seedPassword api node apps/api/dist/db/seed.js
if ($LASTEXITCODE -ne 0) {
    throw "Seed failed with exit code $LASTEXITCODE"
}
