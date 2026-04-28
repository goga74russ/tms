param(
    [string]$ProdRoot = "D:\Ai\TMS-prod",
    [switch]$Apply
)

$ErrorActionPreference = "Stop"

$targets = @(
    "apps\api\test_output.txt",
    "apps\api\drizzle.bak",
    "apps\web\tsconfig.tsbuildinfo",
    "nginx\e2e.conf"
)

$resolved = foreach ($target in $targets) {
    $path = Join-Path $ProdRoot $target
    if (Test-Path -LiteralPath $path) {
        Resolve-Path -LiteralPath $path
    }
}

if (-not $resolved) {
    Write-Host "No cleanup targets found."
    exit 0
}

Write-Host "Cleanup targets:"
$resolved | ForEach-Object { Write-Host " - $($_.Path)" }

if (-not $Apply) {
    Write-Host ""
    Write-Host "Dry run only. Re-run with -Apply to delete these files/directories."
    exit 0
}

$prodFull = (Resolve-Path -LiteralPath $ProdRoot).Path.TrimEnd('\')
foreach ($item in $resolved) {
    $full = $item.Path
    if (-not $full.StartsWith($prodFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to delete outside prod root: $full"
    }
    Remove-Item -LiteralPath $full -Recurse -Force
}

Write-Host "Cleanup complete."
