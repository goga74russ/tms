param(
    [string]$ComposeFile = "D:\Ai\TMS-prod\docker-compose.prod.yml",
    [string]$ProjectDir = "D:\Ai\TMS-prod",
    [string]$DbUser = "tms",
    [string]$DbName = "tms"
)

$ErrorActionPreference = "Stop"

$drizzleDir = Join-Path $ProjectDir "apps/api/drizzle"
if (-not (Test-Path -LiteralPath $drizzleDir)) {
    throw "Drizzle migrations folder not found: $drizzleDir"
}

function Invoke-PsqlText {
    param([string]$Sql)

    $Sql | docker compose -f $ComposeFile exec -T postgres psql -U $DbUser -d $DbName -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) {
        throw "psql command failed with exit code $LASTEXITCODE"
    }
}

function Invoke-PsqlScalar {
    param([string]$Sql)

    $result = $Sql | docker compose -f $ComposeFile exec -T postgres psql -U $DbUser -d $DbName -t -A
    if ($LASTEXITCODE -ne 0) {
        throw "psql scalar command failed with exit code $LASTEXITCODE"
    }
    return (($result -join "`n").Trim())
}

Invoke-PsqlText "CREATE TABLE IF NOT EXISTS tms_schema_migrations (tag TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());"

$files = Get-ChildItem -LiteralPath $drizzleDir -Filter "*.sql" | Sort-Object Name
foreach ($file in $files) {
    $tag = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)

    if ($tag -ne "0000_full_schema") {
        $applied = Invoke-PsqlScalar "SELECT 1 FROM tms_schema_migrations WHERE tag='$tag' LIMIT 1;"
        if ($applied -eq "1") {
            Write-Host "Skipping $tag (already applied)"
            continue
        }
    }

    if ($tag -eq "0000_full_schema") {
        $tableCount = Invoke-PsqlScalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name <> 'tms_schema_migrations';"
        if ([int]$tableCount -ge 5) {
            Write-Host "Skipping $tag (schema already exists: $tableCount tables)"
            continue
        }
    }

    Write-Host "Applying $tag"
    $sql = Get-Content -Raw -Encoding UTF8 -LiteralPath $file.FullName
    Invoke-PsqlText $sql

    if ($tag -ne "0000_full_schema") {
        Invoke-PsqlText "INSERT INTO tms_schema_migrations(tag) VALUES ('$tag') ON CONFLICT (tag) DO NOTHING;"
    }
}

Write-Host "Migrations complete."
