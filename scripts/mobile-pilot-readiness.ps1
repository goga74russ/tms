param(
    [string]$BaseUrl = "http://localhost/api",
    [string]$EnvFile = "D:\Ai\TMS-prod\.env",
    [string]$MobileEnvExample = "D:\Ai\TMS-prod\apps\mobile\.env.example",
    [string]$ComposeFile = "D:\Ai\TMS-prod\docker-compose.prod.yml"
)

$ErrorActionPreference = "Stop"

function Write-Status {
    param(
        [string]$Name,
        [bool]$Ok,
        [string]$Detail = ""
    )

    $mark = if ($Ok) { "OK" } else { "MISSING" }
    if ($Detail) {
        Write-Host ("[{0}] {1}: {2}" -f $mark, $Name, $Detail)
    } else {
        Write-Host ("[{0}] {1}" -f $mark, $Name)
    }
}

Write-Host "Mobile pilot readiness"
Write-Host "Workspace: D:\Ai\TMS-prod"
Write-Host ""

$envExists = Test-Path -LiteralPath $EnvFile
Write-Status ".env" $envExists $EnvFile

$seedPresent = $false
if ($envExists) {
    $seedPresent = [bool](Select-String -Path $EnvFile -Pattern '^SEED_PASSWORD=' -Encoding UTF8 -ErrorAction SilentlyContinue | Select-Object -First 1)
}
Write-Status "driver password source" $seedPresent "SEED_PASSWORD in .env; value is intentionally not printed"
Write-Status "mobile env example" (Test-Path -LiteralPath $MobileEnvExample) $MobileEnvExample
Write-Status "docker compose file" (Test-Path -LiteralPath $ComposeFile) $ComposeFile
Write-Status "mobile smoke script" (Test-Path -LiteralPath "D:\Ai\TMS-prod\scripts\mobile-smoke.ps1") "scripts\mobile-smoke.ps1"
Write-Status "mobile package" (Test-Path -LiteralPath "D:\Ai\TMS-prod\apps\mobile\package.json") "apps\mobile\package.json"

Write-Host ""
Write-Host "Local API health check: $BaseUrl/health"
try {
    $response = Invoke-WebRequest -Method Get -Uri "$BaseUrl/health" -UseBasicParsing -TimeoutSec 5
    Write-Status "API health" ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) ("HTTP {0}" -f $response.StatusCode)
} catch {
    Write-Status "API health" $false $_.Exception.Message
}

Write-Host ""
Write-Host "LAN API URL candidates for EXPO_PUBLIC_API_URL:"
$ips = @()
try {
    $ips = Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object {
            $_.IPAddress -notlike "127.*" -and
            $_.IPAddress -notlike "169.254.*" -and
            $_.PrefixOrigin -ne "WellKnown"
        } |
        Select-Object -ExpandProperty IPAddress -Unique
} catch {
    Write-Host "Could not inspect LAN IPs with Get-NetIPAddress; trying ipconfig."
    try {
        $ips = ipconfig |
            Select-String -Pattern 'IPv4.*?:\s*([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)' |
            ForEach-Object { $_.Matches[0].Groups[1].Value } |
            Where-Object { $_ -notlike "127.*" -and $_ -notlike "169.254.*" } |
            Select-Object -Unique
    } catch {
        $ips = @()
    }
}

if ($ips.Count -eq 0) {
    Write-Host "- No LAN IPv4 candidates found. Run ipconfig and pick the Wi-Fi/Ethernet IPv4 address."
} else {
    foreach ($ip in $ips) {
        Write-Host ("- http://{0}/api" -f $ip)
    }
}

Write-Host ""
Write-Host "Credential note:"
Write-Host "- Login email: driver1@tms.local"
Write-Host "- Password: use SEED_PASSWORD from .env; do not paste it into docs or evidence."

Write-Host ""
Write-Host "Next commands:"
Write-Host "- powershell -NoProfile -ExecutionPolicy Bypass -File scripts\mobile-smoke.ps1 -BaseUrl http://localhost/api"
Write-Host "- `$env:EXPO_PUBLIC_API_URL='http://<LAN-IP>/api'; corepack pnpm --filter @tms/mobile start"
