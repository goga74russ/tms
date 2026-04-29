param(
    [string]$BaseUrl = "http://localhost/api",
    [string]$EnvFile = "D:\Ai\TMS-prod\.env",
    [string]$ComposeFile = "D:\Ai\TMS-prod\docker-compose.prod.yml"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $EnvFile)) { throw ".env file not found: $EnvFile" }
$seedLine = Select-String -Path $EnvFile -Pattern '^SEED_PASSWORD=' | Select-Object -First 1
if (-not $seedLine) { throw "SEED_PASSWORD is missing in $EnvFile" }
$seedPassword = $seedLine.Line -replace '^SEED_PASSWORD=', ''

$prepareSql = @"
WITH actor AS (
    SELECT id AS user_id, organization_id FROM users WHERE email = 'admin@tms.local' LIMIT 1
), org AS (
    SELECT COALESCE((SELECT organization_id FROM actor), (SELECT id FROM organizations ORDER BY created_at LIMIT 1)) AS id
), contractor AS (
    SELECT id FROM contractors ORDER BY created_at LIMIT 1
), cleanup_order AS (
    SELECT id FROM orders WHERE number = 'OC-SMOKE-100T'
), cleanup_facts AS (
    DELETE FROM shipment_facts WHERE order_id IN (SELECT id FROM cleanup_order)
), cleanup_assignments AS (
    DELETE FROM trip_lot_assignments WHERE order_id IN (SELECT id FROM cleanup_order)
), cleanup_lots AS (
    DELETE FROM shipment_lots WHERE order_id IN (SELECT id FROM cleanup_order)
), cleanup_points AS (
    DELETE FROM route_points WHERE trip_id IN (SELECT id FROM trips WHERE number IN ('OC-SMOKE-TRIP-1', 'OC-SMOKE-TRIP-2'))
), cleanup_links AS (
    DELETE FROM trip_orders WHERE order_id IN (SELECT id FROM cleanup_order)
), upsert_order AS (
    INSERT INTO orders (
        number, contractor_id, status, cargo_description, cargo_weight_kg, cargo_volume_m3, cargo_places, cargo_type,
        loading_address, unloading_address, confirmation_mode, organization_id, created_by, updated_at
    )
    SELECT 'OC-SMOKE-100T', c.id, 'confirmed', 'Operational core smoke cargo', 100000, 100, 100, 'general',
           'Moscow smoke loading warehouse', 'Kazan smoke unloading warehouse', 'required', (SELECT id FROM org), a.user_id, now()
    FROM actor a, contractor c
    ON CONFLICT (number) DO UPDATE SET
        status = 'confirmed', trip_id = NULL, cargo_weight_kg = 100000, cargo_volume_m3 = 100, cargo_places = 100,
        organization_id = EXCLUDED.organization_id, updated_at = now()
    RETURNING id, number
), trip1 AS (
    INSERT INTO trips (number, status, planned_distance_km, organization_id, created_by, updated_at)
    SELECT 'OC-SMOKE-TRIP-1', 'planning', 10, (SELECT id FROM org), (SELECT user_id FROM actor), now()
    ON CONFLICT (number) DO UPDATE SET status = 'planning', organization_id = EXCLUDED.organization_id, updated_at = now()
    RETURNING id, number
), trip2 AS (
    INSERT INTO trips (number, status, planned_distance_km, organization_id, created_by, updated_at)
    SELECT 'OC-SMOKE-TRIP-2', 'planning', 20, (SELECT id FROM org), (SELECT user_id FROM actor), now()
    ON CONFLICT (number) DO UPDATE SET status = 'planning', organization_id = EXCLUDED.organization_id, updated_at = now()
    RETURNING id, number
)
SELECT json_build_object(
    'orderId', (SELECT id FROM upsert_order),
    'trip1Id', (SELECT id FROM trip1),
    'trip2Id', (SELECT id FROM trip2)
)::text;
"@

$prepareOutput = $prepareSql | docker compose -f $ComposeFile exec -T postgres psql -U tms -d tms -t -A -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw "Failed to prepare operational core smoke data" }
$prepared = (($prepareOutput -join "`n").Trim() -split "`n" | Select-Object -Last 1).Trim() | ConvertFrom-Json

$loginBody = @{ email = 'admin@tms.local'; password = $seedPassword } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/mobile/login" -ContentType 'application/json' -Body $loginBody
$token = $login.data.token
if (-not $token) { throw 'Login did not return token' }
$headers = @{ Authorization = "Bearer $token" }

$splitBody = @{ maxWeightKg = 60000 } | ConvertTo-Json
$split = Invoke-RestMethod -Method Post -Uri "$BaseUrl/orders/$($prepared.orderId)/lots/split" -Headers $headers -ContentType 'application/json' -Body $splitBody
$lots = @($split.data)
if ($lots.Count -ne 2) { throw "Expected 2 lots, got $($lots.Count)" }

$lot1 = $lots | Where-Object { [double]$_.plannedWeightKg -eq 60000 } | Select-Object -First 1
$lot2 = $lots | Where-Object { [double]$_.plannedWeightKg -eq 40000 } | Select-Object -First 1
if (-not $lot1 -or -not $lot2) { throw 'Expected 60000kg and 40000kg lots' }

$assign1Body = @{ shipmentLotId = $lot1.id; assignedWeightKg = 60000; allowOverCapacity = $true } | ConvertTo-Json
$assign2Body = @{ shipmentLotId = $lot2.id; assignedWeightKg = 40000; allowOverCapacity = $true } | ConvertTo-Json
$assign1 = Invoke-RestMethod -Method Post -Uri "$BaseUrl/trips/$($prepared.trip1Id)/lot-assignments" -Headers $headers -ContentType 'application/json' -Body $assign1Body
$assign2 = Invoke-RestMethod -Method Post -Uri "$BaseUrl/trips/$($prepared.trip2Id)/lot-assignments" -Headers $headers -ContentType 'application/json' -Body $assign2Body

foreach ($pair in @(@{ trip = $prepared.trip1Id; assignment = $assign1.data.assignment.id; weight = 60000 }, @{ trip = $prepared.trip2Id; assignment = $assign2.data.assignment.id; weight = 40000 })) {
    $loadBody = @{ tripLotAssignmentId = $pair.assignment; factType = 'loading'; weightKg = $pair.weight; cargoCondition = 'intact'; source = 'smoke' } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri "$BaseUrl/trips/$($pair.trip)/shipment-facts" -Headers $headers -ContentType 'application/json' -Body $loadBody | Out-Null
    $unloadBody = @{ tripLotAssignmentId = $pair.assignment; factType = 'unloading'; weightKg = $pair.weight; cargoCondition = 'intact'; source = 'smoke' } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri "$BaseUrl/trips/$($pair.trip)/shipment-facts" -Headers $headers -ContentType 'application/json' -Body $unloadBody | Out-Null
}

$fulfillment = Invoke-RestMethod -Method Get -Uri "$BaseUrl/orders/$($prepared.orderId)/fulfillment" -Headers $headers
if ([double]$fulfillment.data.totals.plannedWeightKg -ne 100000) { throw 'plannedWeightKg mismatch' }
if ([double]$fulfillment.data.totals.assignedWeightKg -ne 100000) { throw 'assignedWeightKg mismatch' }
if ([double]$fulfillment.data.totals.loadedWeightKg -ne 100000) { throw 'loadedWeightKg mismatch' }
if ([double]$fulfillment.data.totals.deliveredWeightKg -ne 100000) { throw 'deliveredWeightKg mismatch' }
if ([double]$fulfillment.data.totals.remainingWeightKg -ne 0) { throw 'remainingWeightKg mismatch' }

$plan1 = Invoke-RestMethod -Method Get -Uri "$BaseUrl/trips/$($prepared.trip1Id)/load-plan" -Headers $headers
$plan2 = Invoke-RestMethod -Method Get -Uri "$BaseUrl/trips/$($prepared.trip2Id)/load-plan" -Headers $headers
if ([double]$plan1.data.summary.totalAssignedWeightKg -ne 60000) { throw 'trip1 load plan mismatch' }
if ([double]$plan2.data.summary.totalAssignedWeightKg -ne 40000) { throw 'trip2 load plan mismatch' }

$result = [ordered]@{
    orderId = $prepared.orderId
    lots = $lots.Count
    assignedWeightKg = $fulfillment.data.totals.assignedWeightKg
    deliveredWeightKg = $fulfillment.data.totals.deliveredWeightKg
    remainingWeightKg = $fulfillment.data.totals.remainingWeightKg
    trip1AssignedWeightKg = $plan1.data.summary.totalAssignedWeightKg
    trip2AssignedWeightKg = $plan2.data.summary.totalAssignedWeightKg
}
$result | ConvertTo-Json -Depth 4
