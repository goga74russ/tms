param(
    [string]$BaseUrl = "http://localhost/api",
    [string]$EnvFile = "D:\Ai\TMS-prod\.env",
    [string]$ComposeFile = "D:\Ai\TMS-prod\docker-compose.prod.yml"
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

$prepareSql = @"
WITH admin_password AS (
    SELECT password_hash FROM users WHERE email = 'admin@tms.local' LIMIT 1
), org_a AS (
    INSERT INTO organizations (name, inn)
    VALUES ('P0 Tenant A', '770000000001')
    ON CONFLICT DO NOTHING
    RETURNING id
), org_a_selected AS (
    SELECT id FROM org_a
    UNION ALL
    SELECT id FROM organizations WHERE inn = '770000000001'
    LIMIT 1
), org_b AS (
    INSERT INTO organizations (name, inn)
    VALUES ('P0 Tenant B', '770000000002')
    ON CONFLICT DO NOTHING
    RETURNING id
), org_b_selected AS (
    SELECT id FROM org_b
    UNION ALL
    SELECT id FROM organizations WHERE inn = '770000000002'
    LIMIT 1
), user_a AS (
    INSERT INTO users (email, password_hash, full_name, roles, organization_id)
    SELECT 'p0-tenant-a@tms.local', password_hash, 'P0 Tenant A Dispatcher', '["dispatcher"]'::jsonb, (SELECT id FROM org_a_selected)
    FROM admin_password
    ON CONFLICT (email) DO UPDATE SET organization_id = EXCLUDED.organization_id, roles = EXCLUDED.roles, is_active = true, updated_at = now()
    RETURNING id
), user_b AS (
    INSERT INTO users (email, password_hash, full_name, roles, organization_id)
    SELECT 'p0-tenant-b@tms.local', password_hash, 'P0 Tenant B Dispatcher', '["dispatcher"]'::jsonb, (SELECT id FROM org_b_selected)
    FROM admin_password
    ON CONFLICT (email) DO UPDATE SET organization_id = EXCLUDED.organization_id, roles = EXCLUDED.roles, is_active = true, updated_at = now()
    RETURNING id
), trip_a AS (
    INSERT INTO trips (number, status, planned_distance_km, organization_id, created_by, updated_at)
    SELECT 'P0-MT-A', 'planning', 10, (SELECT id FROM org_a_selected), (SELECT id FROM user_a), now()
    ON CONFLICT (number) DO UPDATE SET status = 'planning', organization_id = EXCLUDED.organization_id, created_by = EXCLUDED.created_by, updated_at = now()
    RETURNING id, number
), trip_b AS (
    INSERT INTO trips (number, status, planned_distance_km, organization_id, created_by, updated_at)
    SELECT 'P0-MT-B', 'planning', 20, (SELECT id FROM org_b_selected), (SELECT id FROM user_b), now()
    ON CONFLICT (number) DO UPDATE SET status = 'planning', organization_id = EXCLUDED.organization_id, created_by = EXCLUDED.created_by, updated_at = now()
    RETURNING id, number
)
SELECT json_build_object(
    'tenantAUser', 'p0-tenant-a@tms.local',
    'tenantBUser', 'p0-tenant-b@tms.local',
    'tenantATripId', (SELECT id FROM trip_a),
    'tenantBTripId', (SELECT id FROM trip_b),
    'tenantATripNumber', (SELECT number FROM trip_a),
    'tenantBTripNumber', (SELECT number FROM trip_b)
)::text;
"@

$prepareOutput = $prepareSql | docker compose -f $ComposeFile exec -T postgres psql -U tms -d tms -t -A -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) {
    throw "Failed to prepare multi-tenant smoke data"
}
$prepared = (($prepareOutput -join "`n").Trim() -split "`n" | Select-Object -Last 1).Trim() | ConvertFrom-Json

function Login-Tms([string]$Email) {
    $body = @{ email = $Email; password = $seedPassword } | ConvertTo-Json
    $login = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/mobile/login" -ContentType 'application/json' -Body $body
    if (-not $login.data.token) { throw "Login failed for $Email" }
    return @{ Authorization = "Bearer $($login.data.token)" }
}

$headersA = Login-Tms $prepared.tenantAUser
$headersB = Login-Tms $prepared.tenantBUser

$listA = Invoke-RestMethod -Method Get -Uri "$BaseUrl/trips?limit=100" -Headers $headersA
$listB = Invoke-RestMethod -Method Get -Uri "$BaseUrl/trips?limit=100" -Headers $headersB

$numbersA = @($listA.data | ForEach-Object { $_.number })
$numbersB = @($listB.data | ForEach-Object { $_.number })

if ($numbersA -notcontains $prepared.tenantATripNumber) { throw "Tenant A cannot see own trip" }
if ($numbersA -contains $prepared.tenantBTripNumber) { throw "Tenant A can see Tenant B trip" }
if ($numbersB -notcontains $prepared.tenantBTripNumber) { throw "Tenant B cannot see own trip" }
if ($numbersB -contains $prepared.tenantATripNumber) { throw "Tenant B can see Tenant A trip" }

$result = [ordered]@{
    tenantAOwnTripVisible = $true
    tenantAForeignTripHidden = $true
    tenantBOwnTripVisible = $true
    tenantBForeignTripHidden = $true
    tenantATrip = $prepared.tenantATripNumber
    tenantBTrip = $prepared.tenantBTripNumber
}
$result | ConvertTo-Json -Depth 4
