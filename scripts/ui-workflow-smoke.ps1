param(
    [string]$BaseUrl = "http://localhost",
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

function Assert-Success($Response, [string]$Name) {
    if (-not $Response.success) {
        throw "$Name did not return success=true"
    }
}

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$loginBody = @{ email = 'super@tms.local'; password = $seedPassword } | ConvertTo-Json
$login = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$BaseUrl/api/auth/login" -ContentType 'application/json' -Body $loginBody -WebSession $session
if ($login.StatusCode -lt 200 -or $login.StatusCode -ge 300) {
    throw "Super login failed: HTTP $($login.StatusCode)"
}

$pages = @('/logist', '/trips', '/claims', '/finance', '/dispatcher')
$pageResults = @()
foreach ($path in $pages) {
    $page = Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$BaseUrl$path" -WebSession $session
    if ($page.StatusCode -ne 200) {
        throw "Page smoke failed for $path`: HTTP $($page.StatusCode)"
    }
    $pageResults += [ordered]@{
        path = $path
        status = $page.StatusCode
        bytes = $page.RawContentLength
    }
}

$orders = Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/orders?limit=5" -WebSession $session
Assert-Success $orders 'orders list'

$trips = Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/trips?limit=5" -WebSession $session
Assert-Success $trips 'trips list'

$claims = Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/claims?limit=10" -WebSession $session
Assert-Success $claims 'claims list'

$claimExposureResult = 'skipped'
$firstClaim = @($claims.data | Select-Object -First 1)
if ($firstClaim.Count -gt 0) {
    $claim = $firstClaim[0]
    $claimScope = $null
    if ($claim.tripId) {
        $claimScope = "tripId=$($claim.tripId)"
    } elseif ($claim.orderId) {
        $claimScope = "orderId=$($claim.orderId)"
    } elseif ($claim.contractorId) {
        $claimScope = "contractorId=$($claim.contractorId)"
    }

    if ($claimScope) {
        $claimExposure = Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/claims/exposure?$claimScope" -WebSession $session
        Assert-Success $claimExposure 'claims exposure'
        $claimExposureResult = 'ok'
    }
}

$exceptions = Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/operations/exceptions?limit=10&includeInfo=true" -WebSession $session
Assert-Success $exceptions 'operations exceptions'
if ($null -eq $exceptions.data.summary -or $null -eq $exceptions.data.exceptions) {
    throw "operations exceptions response is missing summary/exceptions"
}

$tripDossierResult = 'skipped'
$tripCloseGateResult = 'skipped'
$firstTrip = @($trips.data | Select-Object -First 1)
if ($firstTrip.Count -gt 0 -and $firstTrip[0].id) {
    $tripId = $firstTrip[0].id
    $dossier = Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/trips/$tripId/dossier" -WebSession $session
    Assert-Success $dossier 'trip dossier'
    if ($null -eq $dossier.data.closeGate) {
        throw "trip dossier response is missing closeGate"
    }
    $tripDossierResult = 'ok'

    $closeGate = Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/trips/$tripId/dossier/close-gate" -WebSession $session
    Assert-Success $closeGate 'trip close gate'
    if ($null -eq $closeGate.data.canClose) {
        throw "close gate response is missing canClose"
    }
    $tripCloseGateResult = 'ok'
}

[ordered]@{
    uiWorkflowSmoke = 'ok'
    pages = $pageResults
    api = [ordered]@{
        orders = @($orders.data).Count
        trips = @($trips.data).Count
        claims = @($claims.data).Count
        claimExposure = $claimExposureResult
        operationsExceptions = @($exceptions.data.exceptions).Count
        tripDossier = $tripDossierResult
        tripCloseGate = $tripCloseGateResult
    }
} | ConvertTo-Json -Depth 8
