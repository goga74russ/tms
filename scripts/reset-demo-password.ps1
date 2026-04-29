param(
    [string]$ComposeFile = "D:\Ai\TMS-prod\docker-compose.prod.yml",
    [string]$EnvFile = "D:\Ai\TMS-prod\.env"
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

$hashOutput = docker compose -f $ComposeFile run --rm -e SEED_PASSWORD=$seedPassword api node -e "import('./apps/api/dist/auth/auth.js').then(m=>m.hashPassword(process.env.SEED_PASSWORD)).then(h=>console.log(h)).catch(e=>{console.error(e); process.exit(1);})"
if ($LASTEXITCODE -ne 0) {
    throw "Failed to generate password hash"
}
$passwordHash = (($hashOutput -join "`n").Trim() -split "`n" | Select-Object -Last 1).Trim()
if (-not $passwordHash.StartsWith('$2')) {
    throw "Generated password hash looks invalid"
}

$escapedHash = $passwordHash.Replace("'", "''")
$sql = @"
INSERT INTO users (email, password_hash, full_name, roles, is_active, updated_at)
VALUES (
    'super@tms.local',
    '$escapedHash',
    'Super User',
    '["admin","logist","dispatcher","manager","mechanic","medic","repair_service","accountant","driver"]'::jsonb,
    true,
    now()
)
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    roles = EXCLUDED.roles,
    is_active = true,
    updated_at = now();

UPDATE users
SET password_hash = '$escapedHash',
    updated_at = now()
WHERE email IN (
    'super@tms.local',
    'admin@tms.local',
    'logist@tms.local',
    'dispatcher@tms.local',
    'mechanic@tms.local',
    'medic@tms.local',
    'manager@tms.local',
    'accountant@tms.local',
    'repair@tms.local',
    'driver1@tms.local',
    'driver2@tms.local',
    'driver3@tms.local'
);
"@

$updated = $sql | docker compose -f $ComposeFile exec -T postgres psql -U tms -d tms -t -A -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) {
    throw "Failed to update demo passwords"
}

[ordered]@{
    resetDemoPassword = 'ok'
    demoAccounts = 12
} | ConvertTo-Json -Depth 2
