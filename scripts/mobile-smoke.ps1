param(
    [string]$BaseUrl = "http://localhost/api",
    [string]$EnvFile = "D:\Ai\TMS-prod\.env",
    [string]$ComposeFile = "D:\Ai\TMS-prod\docker-compose.prod.yml",
    [string]$Email = "driver1@tms.local",
    [switch]$SkipPrepare
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

$smoke = $null
if (-not $SkipPrepare) {
    $prepareSql = @"
WITH actor AS (
    SELECT id AS user_id FROM users WHERE email = 'admin@tms.local' LIMIT 1
), driver_row AS (
    SELECT d.id AS driver_id, d.user_id, d.organization_id
    FROM drivers d
    JOIN users u ON u.id = d.user_id
    WHERE u.email = 'driver1@tms.local'
    LIMIT 1
), vehicle_row AS (
    SELECT id AS vehicle_id, organization_id, current_odometer_km
    FROM vehicles
    WHERE is_archived = false
    ORDER BY plate_number
    LIMIT 1
), upsert_trip AS (
    INSERT INTO trips (
        number, status, vehicle_id, driver_id, planned_distance_km,
        planned_departure_at, odometer_start, fuel_start, notes,
        organization_id, created_by, updated_at
    )
    SELECT
        'MOB-SMOKE-DRIVER1', 'in_transit', v.vehicle_id, d.driver_id, 42,
        now(), COALESCE(v.current_odometer_km, 100000), 80, 'Mobile smoke trip',
        COALESCE(d.organization_id, v.organization_id), a.user_id, now()
    FROM actor a, driver_row d, vehicle_row v
    ON CONFLICT (number) DO UPDATE SET
        status = 'in_transit',
        vehicle_id = EXCLUDED.vehicle_id,
        driver_id = EXCLUDED.driver_id,
        planned_departure_at = now(),
        actual_completion_at = NULL,
        odometer_end = NULL,
        fuel_end = NULL,
        notes = EXCLUDED.notes,
        organization_id = EXCLUDED.organization_id,
        updated_at = now()
    RETURNING id, number, driver_id, vehicle_id
), reset_points AS (
    DELETE FROM route_points
    WHERE trip_id = (SELECT id FROM upsert_trip)
), point AS (
    INSERT INTO route_points (
        trip_id, type, status, sequence_number, address, lat, lon, window_start, window_end, notes
    )
    SELECT
        id, 'unloading', 'pending', 1, 'Moscow, Mobile smoke route point', 55.7558, 37.6176,
        now(), now() + interval '2 hours', 'Created by mobile-smoke.ps1'
    FROM upsert_trip
    RETURNING id, trip_id
), vehicle_update AS (
    UPDATE vehicles
    SET status = 'in_trip', updated_at = now()
    WHERE id = (SELECT vehicle_id FROM upsert_trip)
)
SELECT json_build_object(
    'tripId', (SELECT id FROM upsert_trip),
    'tripNumber', (SELECT number FROM upsert_trip),
    'routePointId', (SELECT id FROM point),
    'driverId', (SELECT driver_id FROM upsert_trip),
    'vehicleId', (SELECT vehicle_id FROM upsert_trip)
)::text;
"@

    $prepareOutput = $prepareSql | docker compose -f $ComposeFile exec -T postgres psql -U tms -d tms -t -A -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to prepare mobile smoke data"
    }
    $smokeJson = (($prepareOutput -join "`n").Trim() -split "`n" | Select-Object -Last 1).Trim()
    $smoke = $smokeJson | ConvertFrom-Json
}

$loginBody = @{ email = $Email; password = $seedPassword } | ConvertTo-Json
$login = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/mobile/login" -ContentType 'application/json' -Body $loginBody
$token = $login.data.token
if (-not $token) {
    throw 'Mobile login did not return a bearer token'
}

$headers = @{ Authorization = "Bearer $token" }
$me = Invoke-RestMethod -Method Get -Uri "$BaseUrl/auth/me" -Headers $headers
if (-not $me.success) {
    throw 'auth/me did not return success=true'
}
if (-not $me.data.driverId) {
    throw 'auth/me did not return driverId for driver user'
}

$sync = Invoke-RestMethod -Method Get -Uri "$BaseUrl/sync/pull?lastSyncAt=0&schemaVersion=1" -Headers $headers
if (-not $sync.success) {
    throw 'sync/pull did not return success=true'
}

$pulledTrips = @($sync.changes.trips.created).Count + @($sync.changes.trips.updated).Count
$pulledRoutePoints = @($sync.changes.route_points.created).Count + @($sync.changes.route_points.updated).Count
if (-not $SkipPrepare -and ($pulledTrips -lt 1 -or $pulledRoutePoints -lt 1)) {
    throw "sync/pull did not return the prepared smoke trip and route point"
}

$checkpointResult = $null
$completionResult = $null
if (-not $SkipPrepare) {
    $checkpointBody = @{
        events = @(@{
            id = ([guid]::NewGuid()).ToString()
            type = 'route_point_completed'
            timestamp = (Get-Date).ToUniversalTime().ToString('o')
            payload = @{
                pointId = [string]$smoke.routePointId
                photoUrls = @('smoke://route-point-photo.jpg')
                signatureUrl = 'smoke://recipient-signature.png'
            }
        })
    } | ConvertTo-Json -Depth 8
    $checkpointResult = Invoke-RestMethod -Method Post -Uri "$BaseUrl/sync/events" -Headers $headers -ContentType 'application/json' -Body $checkpointBody
    if (-not $checkpointResult.success -or $checkpointResult.data.failed -ne 0) {
        throw 'route_point_completed sync event failed'
    }

    $completionBody = @{
        events = @(@{
            id = ([guid]::NewGuid()).ToString()
            type = 'trip_status_changed'
            timestamp = (Get-Date).ToUniversalTime().ToString('o')
            payload = @{
                tripId = [string]$smoke.tripId
                status = 'completed'
                odometer = 100123
                fuel = 42
            }
        })
    } | ConvertTo-Json -Depth 8
    $completionResult = Invoke-RestMethod -Method Post -Uri "$BaseUrl/sync/events" -Headers $headers -ContentType 'application/json' -Body $completionBody
    if (-not $completionResult.success -or $completionResult.data.failed -ne 0) {
        throw 'trip_status_changed sync event failed'
    }
}

$result = [ordered]@{
    login = 'ok'
    me = 'ok'
    email = $me.data.email
    roles = ($me.data.roles -join ',')
    hasDriverId = [bool]$me.data.driverId
    syncPull = 'ok'
    pulledTrips = $pulledTrips
    pulledRoutePoints = $pulledRoutePoints
    preparedTrip = if ($smoke) { $smoke.tripNumber } else { $null }
    checkpointPush = if ($checkpointResult) { 'ok' } else { 'skipped' }
    tripCompletionPush = if ($completionResult) { 'ok' } else { 'skipped' }
}

$result | ConvertTo-Json -Depth 4
