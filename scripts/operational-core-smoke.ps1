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
    SELECT id FROM orders WHERE number IN ('OC-SMOKE-100T', 'OC-SMOKE-CARGO-RULES')
), cleanup_facts AS (
    DELETE FROM shipment_facts WHERE order_id IN (SELECT id FROM cleanup_order)
), cleanup_assignments AS (
    DELETE FROM trip_lot_assignments WHERE order_id IN (SELECT id FROM cleanup_order)
), cleanup_lots AS (
    DELETE FROM shipment_lots WHERE order_id IN (SELECT id FROM cleanup_order)
), cleanup_points AS (
    DELETE FROM route_points WHERE trip_id IN (SELECT id FROM trips WHERE number IN ('OC-SMOKE-TRIP-1', 'OC-SMOKE-TRIP-2', 'OC-SMOKE-TRIP-3'))
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
), cargo_order AS (
    INSERT INTO orders (
        number, contractor_id, status, cargo_description, cargo_weight_kg, cargo_volume_m3, cargo_places, cargo_type,
        loading_address, unloading_address, vehicle_requirements, confirmation_mode, organization_id, created_by, updated_at
    )
    SELECT 'OC-SMOKE-CARGO-RULES', c.id, 'confirmed', 'Food and hazardous chemical smoke cargo', 2000, 10, 20, 'food',
           'Moscow food warehouse', 'Kazan chemical lab', 'valuable insured sealed', 'required', (SELECT id FROM org), a.user_id, now()
    FROM actor a, contractor c
    ON CONFLICT (number) DO UPDATE SET
        status = 'confirmed', trip_id = NULL, cargo_weight_kg = 2000, cargo_volume_m3 = 10, cargo_places = 20,
        cargo_type = 'food', vehicle_requirements = 'valuable insured sealed',
        organization_id = EXCLUDED.organization_id, updated_at = now()
    RETURNING id, number
), trip3 AS (
    INSERT INTO trips (number, status, planned_distance_km, organization_id, created_by, updated_at)
    SELECT 'OC-SMOKE-TRIP-3', 'planning', 30, (SELECT id FROM org), (SELECT user_id FROM actor), now()
    ON CONFLICT (number) DO UPDATE SET status = 'planning', organization_id = EXCLUDED.organization_id, updated_at = now()
    RETURNING id, number
)
SELECT json_build_object(
    'orderId', (SELECT id FROM upsert_order),
    'cargoOrderId', (SELECT id FROM cargo_order),
    'trip1Id', (SELECT id FROM trip1),
    'trip2Id', (SELECT id FROM trip2),
    'trip3Id', (SELECT id FROM trip3),
    'vehicleId', (SELECT id FROM vehicles WHERE (organization_id = (SELECT id FROM org) OR organization_id IS NULL) AND is_archived = false ORDER BY created_at LIMIT 1),
    'driverId', (SELECT id FROM drivers WHERE (organization_id = (SELECT id FROM org) OR organization_id IS NULL) AND is_active = true ORDER BY created_at LIMIT 1),
    'driver2Id', COALESCE(
        (SELECT id FROM drivers WHERE (organization_id = (SELECT id FROM org) OR organization_id IS NULL) AND is_active = true ORDER BY created_at OFFSET 1 LIMIT 1),
        (SELECT id FROM drivers WHERE (organization_id = (SELECT id FROM org) OR organization_id IS NULL) AND is_active = true ORDER BY created_at LIMIT 1)
    )
)::text;
"@

$prepareOutput = $prepareSql | docker compose -f $ComposeFile exec -T postgres psql -U tms -d tms -t -A -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw "Failed to prepare operational core smoke data" }
$prepared = (($prepareOutput -join "`n").Trim() -split "`n" | Select-Object -Last 1).Trim() | ConvertFrom-Json
if (-not $prepared.vehicleId) { throw 'Smoke requires at least one vehicle in seed data' }
if (-not $prepared.driverId) { throw 'Smoke requires at least one driver in seed data' }
if (-not $prepared.driver2Id) { throw 'Smoke requires a fallback second driver id' }
if (-not $prepared.cargoOrderId) { throw 'Smoke requires cargo rules order' }

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

$cargoSplitBody = @{ maxWeightKg = 1000 } | ConvertTo-Json
$cargoSplit = Invoke-RestMethod -Method Post -Uri "$BaseUrl/orders/$($prepared.cargoOrderId)/lots/split" -Headers $headers -ContentType 'application/json' -Body $cargoSplitBody
$cargoLots = @($cargoSplit.data)
if ($cargoLots.Count -ne 2) { throw "Expected 2 cargo rule lots, got $($cargoLots.Count)" }
$cargoLot1 = $cargoLots[0]
$cargoLot2 = $cargoLots[1]
$cargoRulesSql = @"
UPDATE shipment_lots
SET cargo_type = 'food valuable insured sealed', cargo_description = 'Food cargo with declared value'
WHERE id = '$($cargoLot1.id)';
UPDATE shipment_lots
SET cargo_type = 'hazardous chemical bulk oversized', cargo_description = 'Hazardous chemical bulk oversized cargo'
WHERE id = '$($cargoLot2.id)';
"@
$cargoRulesSql | docker compose -f $ComposeFile exec -T postgres psql -U tms -d tms -v ON_ERROR_STOP=1 | Out-Null

$assign1Body = @{ shipmentLotId = $lot1.id; assignedWeightKg = 60000; allowOverCapacity = $true } | ConvertTo-Json
$assign2Body = @{ shipmentLotId = $lot2.id; assignedWeightKg = 40000; allowOverCapacity = $true } | ConvertTo-Json
$assign1 = Invoke-RestMethod -Method Post -Uri "$BaseUrl/trips/$($prepared.trip1Id)/lot-assignments" -Headers $headers -ContentType 'application/json' -Body $assign1Body
$assign2 = Invoke-RestMethod -Method Post -Uri "$BaseUrl/trips/$($prepared.trip2Id)/lot-assignments" -Headers $headers -ContentType 'application/json' -Body $assign2Body
$executionRoutePointId = @($assign1.data.routePoints)[0].id

$cargoAssign1Body = @{ shipmentLotId = $cargoLot1.id; assignedWeightKg = 1000; allowOverCapacity = $true } | ConvertTo-Json
$cargoAssign2Body = @{ shipmentLotId = $cargoLot2.id; assignedWeightKg = 1000; allowOverCapacity = $true } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$BaseUrl/trips/$($prepared.trip3Id)/lot-assignments" -Headers $headers -ContentType 'application/json' -Body $cargoAssign1Body | Out-Null
Invoke-RestMethod -Method Post -Uri "$BaseUrl/trips/$($prepared.trip3Id)/lot-assignments" -Headers $headers -ContentType 'application/json' -Body $cargoAssign2Body | Out-Null

$replaceBody = @{
    vehicleId = $prepared.vehicleId
    driverId = $prepared.driverId
    reason = 'Operational smoke resource replacement'
    notes = 'Smoke validates ETRN Title 04 resource replacement trace'
} | ConvertTo-Json
$replacement = Invoke-RestMethod -Method Post -Uri "$BaseUrl/trips/$($prepared.trip1Id)/resource-replacements" -Headers $headers -ContentType 'application/json' -Body $replaceBody
if ($replacement.data.event.eventType -ne 'trip.resource.replaced') { throw 'resource replacement event type mismatch' }
if ($replacement.data.event.data.etrn.titleType -ne '04') { throw 'resource replacement ETRN title mismatch' }

$unloadingPoint = @($assign2.data.routePoints | Where-Object { $_.type -eq 'unloading' } | Select-Object -First 1)
if (-not $unloadingPoint) { throw 'Expected unloading route point for readdressing smoke' }
$readdressBody = @{
    routePointId = $unloadingPoint.id
    address = 'Kazan smoke readdressed unloading warehouse'
    lat = 55.8304
    lon = 49.0661
    reason = 'Recipient changed dock'
    notes = 'Smoke validates ETRN Title 03 readdressing trace'
} | ConvertTo-Json
$readdress = Invoke-RestMethod -Method Post -Uri "$BaseUrl/trips/$($prepared.trip2Id)/route-changes/readdress" -Headers $headers -ContentType 'application/json' -Body $readdressBody
if ($readdress.data.event.eventType -ne 'trip.route.readdressed') { throw 'readdress event type mismatch' }
if ($readdress.data.event.data.etrn.titleType -ne '03') { throw 'readdress ETRN title mismatch' }

$nowUtc = (Get-Date).ToUniversalTime()
$downtimeBody = @{
    vehicleArrivedAt = $nowUtc.AddHours(-3).ToString("o")
    waitingStartedAt = $nowUtc.AddHours(-3).ToString("o")
    waitingEndedAt = $nowUtc.AddMinutes(-20).ToString("o")
    freeMinutes = 120
    reserveAmount = 2500
    reason = 'Warehouse queue'
    notes = 'Smoke validates route point downtime trace'
} | ConvertTo-Json
$downtime = Invoke-RestMethod -Method Post -Uri "$BaseUrl/trips/$($prepared.trip2Id)/route-points/$($unloadingPoint.id)/downtime" -Headers $headers -ContentType 'application/json' -Body $downtimeBody
if ($downtime.data.event.eventType -ne 'trip.point.downtime_recorded') { throw 'downtime event type mismatch' }
if ([int]$downtime.data.billableMinutes -le 0) { throw 'Expected positive downtime billable minutes' }

$postTripReturnBody = @{
    actualCompletionAt = $nowUtc.ToString("o")
    odometerEnd = 123456
    fuelEnd = 75
    originalDocumentsReceived = $false
    postTripInspectionStatus = 'failed'
    documentsReturned = $false
    blockNextTrip = $true
    notes = 'Smoke validates post-trip return blocker'
} | ConvertTo-Json
$postTripReturn = Invoke-RestMethod -Method Post -Uri "$BaseUrl/trips/$($prepared.trip2Id)/post-trip-return" -Headers $headers -ContentType 'application/json' -Body $postTripReturnBody
if ($postTripReturn.data.event.eventType -ne 'trip.post_trip.return_recorded') { throw 'post-trip return event type mismatch' }
if ($postTripReturn.data.event.data.blockNextTrip -ne $true) { throw 'Expected post-trip return next-trip blocker' }

$crewRestBody = @{
    maxShiftMinutes = 540
    notes = 'Smoke validates crew and rest plan risks'
    crew = @(
        @{
            driverId = $prepared.driverId
            shiftStart = $nowUtc.AddHours(-12).ToString("o")
            shiftEnd = $nowUtc.ToString("o")
            isPrimary = $true
        },
        @{
            driverId = $prepared.driver2Id
            shiftStart = $nowUtc.AddHours(-6).ToString("o")
            shiftEnd = $nowUtc.AddHours(1).ToString("o")
            isPrimary = $false
        }
    )
} | ConvertTo-Json -Depth 5
$crewRest = Invoke-RestMethod -Method Post -Uri "$BaseUrl/trips/$($prepared.trip2Id)/crew-rest-plan" -Headers $headers -ContentType 'application/json' -Body $crewRestBody
if ($crewRest.data.event.eventType -ne 'trip.crew.rest_plan_recorded') { throw 'crew rest event type mismatch' }
if ($crewRest.data.event.data.riskLevel -ne 'blocking') { throw 'Expected blocking crew rest risk' }

$breakdownBody = @{
    routePointId = $executionRoutePointId
    reason = 'Smoke road breakdown'
    notes = 'Smoke validates breakdown disruption trace'
    lat = 55.7558
    lon = 37.6173
    requiresReplacement = $true
} | ConvertTo-Json
$breakdown = Invoke-RestMethod -Method Post -Uri "$BaseUrl/trips/$($prepared.trip1Id)/breakdowns" -Headers $headers -ContentType 'application/json' -Body $breakdownBody
if ($breakdown.data.event.eventType -ne 'trip.disruption.breakdown') { throw 'breakdown event type mismatch' }

$executionBody = @{
    type = 'delay'
    routePointId = $executionRoutePointId
    reason = 'traffic'
    notes = 'Operational smoke execution event'
    gps = @{ lat = 55.7558; lon = 37.6173; accuracyM = 30 }
    attachments = @(@{ kind = 'photo-placeholder'; localId = 'smoke-photo-1'; status = 'pending_upload' })
    offlineCreatedAt = (Get-Date).ToUniversalTime().AddMinutes(-5).ToString("o")
    clientEventId = "OC-SMOKE-$([guid]::NewGuid())"
    source = 'smoke'
    metadata = @{ syncScenario = 'offline-later' }
} | ConvertTo-Json -Depth 6
$execution = Invoke-RestMethod -Method Post -Uri "$BaseUrl/trips/$($prepared.trip1Id)/execution-events" -Headers $headers -ContentType 'application/json' -Body $executionBody
if ($execution.data.event.eventType -ne 'trip.execution.delay') { throw 'execution event type mismatch' }
if ($execution.data.event.data.type -ne 'delay') { throw 'execution event payload mismatch' }

foreach ($pair in @(@{ trip = $prepared.trip1Id; assignment = $assign1.data.assignment.id; weight = 60000 }, @{ trip = $prepared.trip2Id; assignment = $assign2.data.assignment.id; weight = 40000 })) {
    $loadBody = @{ tripLotAssignmentId = $pair.assignment; factType = 'loading'; weightKg = $pair.weight; cargoCondition = 'intact'; source = 'smoke' } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri "$BaseUrl/trips/$($pair.trip)/shipment-facts" -Headers $headers -ContentType 'application/json' -Body $loadBody | Out-Null
    $unloadWeight = $pair.weight
    $condition = 'intact'
    $discrepancy = $null
    $notes = $null
    if ($pair.weight -eq 40000) {
        $unloadWeight = 39000
        $condition = 'partial'
        $discrepancy = 'shortage'
        $notes = 'Operational smoke shortage: delivered 39000 of 40000 kg'
    }
    $unloadBody = @{ tripLotAssignmentId = $pair.assignment; factType = 'unloading'; weightKg = $unloadWeight; cargoCondition = $condition; discrepancyCode = $discrepancy; notes = $notes; source = 'smoke' } | ConvertTo-Json
    Invoke-RestMethod -Method Post -Uri "$BaseUrl/trips/$($pair.trip)/shipment-facts" -Headers $headers -ContentType 'application/json' -Body $unloadBody | Out-Null
}

$fulfillment = Invoke-RestMethod -Method Get -Uri "$BaseUrl/orders/$($prepared.orderId)/fulfillment" -Headers $headers
if ([double]$fulfillment.data.totals.plannedWeightKg -ne 100000) { throw 'plannedWeightKg mismatch' }
if ([double]$fulfillment.data.totals.assignedWeightKg -ne 100000) { throw 'assignedWeightKg mismatch' }
if ([double]$fulfillment.data.totals.loadedWeightKg -ne 100000) { throw 'loadedWeightKg mismatch' }
if ([double]$fulfillment.data.totals.deliveredWeightKg -ne 99000) { throw 'deliveredWeightKg mismatch' }
if ([double]$fulfillment.data.totals.remainingWeightKg -ne 1000) { throw 'remainingWeightKg mismatch' }

$plan1 = Invoke-RestMethod -Method Get -Uri "$BaseUrl/trips/$($prepared.trip1Id)/load-plan" -Headers $headers
$plan2 = Invoke-RestMethod -Method Get -Uri "$BaseUrl/trips/$($prepared.trip2Id)/load-plan" -Headers $headers
if ([double]$plan1.data.summary.totalAssignedWeightKg -ne 60000) { throw 'trip1 load plan mismatch' }
if ([double]$plan2.data.summary.totalAssignedWeightKg -ne 40000) { throw 'trip2 load plan mismatch' }

$compatibility1 = Invoke-RestMethod -Method Get -Uri "$BaseUrl/trips/$($prepared.trip1Id)/compatibility" -Headers $headers
if (-not $compatibility1.data.checks) { throw 'trip1 compatibility checks missing' }
if (-not (@($compatibility1.data.checks | ForEach-Object { $_.code }) -contains 'payload')) { throw 'trip1 compatibility payload check missing' }

$cargoCompatibility = Invoke-RestMethod -Method Get -Uri "$BaseUrl/trips/$($prepared.trip3Id)/compatibility" -Headers $headers
$cargoCheckCodes = @($cargoCompatibility.data.checks | ForEach-Object { $_.code })
if (-not ($cargoCheckCodes -contains 'cargo_incompatibility')) { throw 'cargo incompatibility check missing' }
if (-not ($cargoCheckCodes -contains 'hazardous_cargo')) { throw 'hazardous cargo check missing' }
if (-not ($cargoCheckCodes -contains 'oversized_or_heavyweight')) { throw 'oversized/heavyweight cargo check missing' }
if (-not (@($cargoCompatibility.data.assignments | ForEach-Object { $_.checks } | ForEach-Object { $_.code }) -contains 'bulk_cargo_body')) { throw 'bulk cargo body check missing' }

$claims = Invoke-RestMethod -Method Get -Uri "$BaseUrl/claims?status=open" -Headers $headers
$claimForOrder = @($claims.data | Where-Object { $_.orderId -eq $prepared.orderId })
if ($claimForOrder.Count -lt 1) { throw 'Expected auto-created open claim for shortage' }
$claimExposure = Invoke-RestMethod -Method Get -Uri "$BaseUrl/claims/exposure?orderId=$($prepared.orderId)" -Headers $headers
if ([int]$claimExposure.data.summary.claimCount -lt 1) { throw 'Expected claim exposure summary for order' }
if (-not ($claimExposure.data.summary.PSObject.Properties.Name -contains 'openExposureAmount')) { throw 'Expected openExposureAmount in claim exposure summary' }

$dossier = Invoke-RestMethod -Method Get -Uri "$BaseUrl/trips/$($prepared.trip2Id)/dossier" -Headers $headers
$dossierItems = @($dossier.data.dossierItems)
if ($dossierItems.Count -lt 1) { throw 'Expected dossier items projection' }
if (-not (@($dossierItems | ForEach-Object { $_.documentType }) -contains 'etrn')) { throw 'Expected ETRN dossier placeholder' }
if (-not $dossier.data.closeGate) { throw 'Expected dossier close gate in dossier response' }
if ($dossier.data.closeGate.etrn.missing -ne $true) { throw 'Expected missing ETRN close gate signal' }

$closeGate = Invoke-RestMethod -Method Get -Uri "$BaseUrl/trips/$($prepared.trip2Id)/dossier/close-gate" -Headers $headers
if ($closeGate.data.tripId -ne $prepared.trip2Id) { throw 'Close gate tripId mismatch' }
if (-not @($closeGate.data.blockingItems | Where-Object { $_.documentType -eq 'etrn' })) { throw 'Expected ETRN blocking close gate item' }

$exceptions = Invoke-RestMethod -Method Get -Uri "$BaseUrl/operations/exceptions?tripId=$($prepared.trip2Id)&includeInfo=true" -Headers $headers
if ([int]$exceptions.data.summary.total -lt 1) { throw 'Expected operational exceptions for trip2' }
if (-not @($exceptions.data.exceptions | Where-Object { $_.type -eq 'etrn_blocking' -and $_.severity -eq 'blocking' })) { throw 'Expected ETRN blocking operational exception' }
if (-not @($exceptions.data.exceptions | Where-Object { $_.type -eq 'open_claim' -or $_.type -eq 'shipment_discrepancy' })) { throw 'Expected claim or shipment discrepancy operational exception' }
if (-not @($exceptions.data.exceptions | Where-Object { $_.type -eq 'route_change' })) { throw 'Expected route change operational exception' }
if (-not @($exceptions.data.exceptions | Where-Object { $_.type -eq 'post_trip_return' -and $_.severity -eq 'blocking' })) { throw 'Expected blocking post-trip return operational exception' }
if (-not @($exceptions.data.exceptions | Where-Object { $_.type -eq 'crew_rest' -and $_.severity -eq 'blocking' })) { throw 'Expected blocking crew rest operational exception' }

$trip1Exceptions = Invoke-RestMethod -Method Get -Uri "$BaseUrl/operations/exceptions?tripId=$($prepared.trip1Id)&includeInfo=true" -Headers $headers
if (-not @($trip1Exceptions.data.exceptions | Where-Object { $_.type -eq 'resource_replacement' })) { throw 'Expected resource replacement operational exception' }
if (-not @($trip1Exceptions.data.exceptions | Where-Object { $_.type -eq 'breakdown' -and $_.severity -eq 'blocking' })) { throw 'Expected blocking breakdown operational exception' }

$cancelBody = @{
    routePointId = $executionRoutePointId
    vehicleArrivedAt = (Get-Date).ToUniversalTime().ToString("o")
    reason = 'Cargo not ready after vehicle arrival'
    notes = 'Smoke validates cancellation after arrival trace'
    reserveAmount = 1500
    cancelTrip = $true
} | ConvertTo-Json
$cancelAfterArrival = Invoke-RestMethod -Method Post -Uri "$BaseUrl/trips/$($prepared.trip1Id)/cancel-after-arrival" -Headers $headers -ContentType 'application/json' -Body $cancelBody
if ($cancelAfterArrival.data.event.eventType -ne 'trip.cancellation.after_arrival') { throw 'cancel-after-arrival event type mismatch' }
if ($cancelAfterArrival.data.trip.status -ne 'cancelled') { throw 'Expected trip cancellation status' }

$trip1ExceptionsAfterCancel = Invoke-RestMethod -Method Get -Uri "$BaseUrl/operations/exceptions?tripId=$($prepared.trip1Id)&includeInfo=true" -Headers $headers
if (-not @($trip1ExceptionsAfterCancel.data.exceptions | Where-Object { $_.type -eq 'cancellation_after_arrival' })) { throw 'Expected cancellation after arrival operational exception' }

$result = [ordered]@{
    orderId = $prepared.orderId
    lots = $lots.Count
    assignedWeightKg = $fulfillment.data.totals.assignedWeightKg
    deliveredWeightKg = $fulfillment.data.totals.deliveredWeightKg
    remainingWeightKg = $fulfillment.data.totals.remainingWeightKg
    openClaimsForOrder = $claimForOrder.Count
    claimExposureAmount = $claimExposure.data.summary.openExposureAmount
    dossierItems = $dossierItems.Count
    executionEventId = $execution.data.event.id
    resourceReplacementEventId = $replacement.data.event.id
    readdressEventId = $readdress.data.event.id
    downtimeEventId = $downtime.data.event.id
    postTripReturnEventId = $postTripReturn.data.event.id
    crewRestEventId = $crewRest.data.event.id
    breakdownEventId = $breakdown.data.event.id
    cancelAfterArrivalEventId = $cancelAfterArrival.data.event.id
    closeGateCanClose = $closeGate.data.canClose
    closeGateBlockingItems = @($closeGate.data.blockingItems).Count
    operationalExceptions = $exceptions.data.summary.total
    operationalBlockingExceptions = $exceptions.data.summary.blocking
    trip1OperationalExceptions = $trip1ExceptionsAfterCancel.data.summary.total
    trip1AssignedWeightKg = $plan1.data.summary.totalAssignedWeightKg
    trip2AssignedWeightKg = $plan2.data.summary.totalAssignedWeightKg
    trip1CompatibilityStatus = $compatibility1.data.status
    cargoRulesCompatibilityStatus = $cargoCompatibility.data.status
}
$result | ConvertTo-Json -Depth 4
