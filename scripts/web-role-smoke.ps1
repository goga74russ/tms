param(
    [string]$BaseUrl = "http://localhost",
    [string]$EnvFile = "D:\Ai\TMS-prod\.env",
    [int]$LoginDelaySeconds = 13
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

$checks = @(
    @{ role = 'admin'; email = 'admin@tms.local'; path = '/admin/users' },
    @{ role = 'dispatcher'; email = 'dispatcher@tms.local'; path = '/dispatcher' },
    @{ role = 'logist'; email = 'logist@tms.local'; path = '/logist' },
    @{ role = 'mechanic'; email = 'mechanic@tms.local'; path = '/mechanic' },
    @{ role = 'medic'; email = 'medic@tms.local'; path = '/medic' },
    @{ role = 'accountant'; email = 'accountant@tms.local'; path = '/finance' },
    @{ role = 'manager'; email = 'manager@tms.local'; path = '/analytics' }
)

$results = @()
for ($i = 0; $i -lt $checks.Count; $i++) {
    $check = $checks[$i]
    if ($i -gt 0 -and $LoginDelaySeconds -gt 0) {
        Start-Sleep -Seconds $LoginDelaySeconds
    }

    $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    $body = @{ email = $check.email; password = $seedPassword } | ConvertTo-Json
    $login = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "$BaseUrl/api/auth/login" -ContentType 'application/json' -Body $body -WebSession $session
    if ($login.StatusCode -lt 200 -or $login.StatusCode -ge 300) {
        throw "Login failed for $($check.role): HTTP $($login.StatusCode)"
    }

    $me = Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/auth/me" -WebSession $session
    if (-not $me.success) {
        throw "auth/me failed for $($check.role)"
    }

    $page = Invoke-WebRequest -UseBasicParsing -Method Get -Uri "$BaseUrl$($check.path)" -WebSession $session -ErrorAction Stop
    if ($page.StatusCode -ne 200) {
        throw "Page smoke failed for $($check.role) $($check.path): HTTP $($page.StatusCode)"
    }

    $results += [ordered]@{
        role = $check.role
        email = $check.email
        path = $check.path
        status = $page.StatusCode
        bytes = $page.RawContentLength
    }
}

[ordered]@{
    webRoleSmoke = 'ok'
    checked = $results.Count
    loginDelaySeconds = $LoginDelaySeconds
    results = $results
} | ConvertTo-Json -Depth 6
