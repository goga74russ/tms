param(
    [string]$ComposeFile = "D:\Ai\TMS-prod\docker-compose.prod.yml",
    [string]$BackupDir = "C:\tmp\tms-backups"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = Join-Path $BackupDir "tms-schema-$stamp.sql"
$restoreDb = "tms_restore_smoke_$stamp" -replace '-', '_'

$dump = docker compose -f $ComposeFile exec -T postgres pg_dump -U tms -d tms --schema-only --no-owner --no-privileges
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed" }
Set-Content -LiteralPath $backupPath -Value ($dump -join "`n") -Encoding UTF8

try {
    docker compose -f $ComposeFile exec -T postgres createdb -U tms $restoreDb
    if ($LASTEXITCODE -ne 0) { throw "createdb failed" }

    Get-Content -Raw -LiteralPath $backupPath | docker compose -f $ComposeFile exec -T postgres psql -U tms -d $restoreDb -v ON_ERROR_STOP=1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "schema restore failed" }

    $tableCountRaw = "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" | docker compose -f $ComposeFile exec -T postgres psql -U tms -d $restoreDb -t -A
    if ($LASTEXITCODE -ne 0) { throw "restore verification query failed" }
    $tableCount = [int](($tableCountRaw -join "`n").Trim())
    if ($tableCount -lt 10) { throw "restore verification found too few tables: $tableCount" }

    [ordered]@{
        backup = "ok"
        restore = "ok"
        backupPath = $backupPath
        restoreDatabase = $restoreDb
        restoredTableCount = $tableCount
    } | ConvertTo-Json -Depth 4
}
finally {
    docker compose -f $ComposeFile exec -T postgres dropdb -U tms --if-exists $restoreDb | Out-Null
}
