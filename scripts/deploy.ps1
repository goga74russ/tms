# ============================================================
# TransPult — prod deploy wrapper (runs on dev box).
#
# Usage:
#   pwsh scripts/deploy.ps1
#   pwsh scripts/deploy.ps1 -Key C:\Users\me\.ssh\custom_key
#   pwsh scripts/deploy.ps1 -Host 135.106.152.23 -User transpult
#
# What it does:
#   1. Validates the SSH key path locally
#   2. SSHes to prod and runs scripts/deploy.sh there
#
# Why a wrapper:
#   * PowerShell 5.1 doesn't understand bash heredocs (<<EOF), <stdin
#     redirect, set -e, &&/||. Embedding a multi-line deploy script
#     inline is fragile. This wrapper just invokes the version-controlled
#     remote script — single source of truth.
# ============================================================

param(
    [string]$Key  = "$env:USERPROFILE\.ssh\transpult_ed25519",
    [string]$Host = '135.106.152.23',
    [string]$User = 'transpult',
    [string]$ProjectDir = '/opt/transpult'
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Key)) {
    Write-Error "SSH key not found at: $Key"
    exit 1
}

Write-Host "Triggering prod deploy on $User@$Host ..." -ForegroundColor Cyan
Write-Host "Key       : $Key"
Write-Host "ProjectDir: $ProjectDir"
Write-Host ""

# Single quoted argument forwards to remote sh -c → it picks up bash via shebang.
# We invoke the remote script directly; everything lives in version control.
& ssh -i $Key "$User@$Host" "cd $ProjectDir && bash scripts/deploy.sh"

if ($LASTEXITCODE -ne 0) {
    Write-Error "Remote deploy.sh exited with code $LASTEXITCODE"
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "✅ Deploy finished successfully" -ForegroundColor Green
