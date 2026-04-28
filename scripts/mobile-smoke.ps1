param(
    [string]$BaseUrl = "http://localhost/api",
    [string]$EnvFile = "D:\Ai\TMS-prod\.env",
    [string]$Email = "driver1@tms.local"
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

$result = [ordered]@{
    login = 'ok'
    me = 'ok'
    email = $me.data.email
    roles = ($me.data.roles -join ',')
    hasDriverId = [bool]$me.data.driverId
    syncPull = 'ok'
    pulledTrips = @($sync.changes.trips.created).Count + @($sync.changes.trips.updated).Count
    pulledRoutePoints = @($sync.changes.route_points.created).Count + @($sync.changes.route_points.updated).Count
}

$result | ConvertTo-Json -Depth 4
