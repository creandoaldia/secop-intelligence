<#
.SYNOPSIS
  Migracion one-shot: extrae las 17 claves de SECOP Intelligence desde el
  .env.enc GLOBAL de wafle y del .env local, crea .env.enc propio del proyecto,
  y sanitiza .env.

  Debe ejecutarse UNA SOLA VEZ (es idempotente con guard).
  Requiere: pwsh, clave maestra global (~/.config/watch/.env.master).
#>

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LocalEnv = "$ProjectRoot\apps\web\.env"
$LocalEncFile = "$ProjectRoot\.env.enc"
$GlobalEncFile = "C:\web-ai-lab\.env.enc"
$GlobalMasterKeyFile = "$env:USERPROFILE\.config\watch\.env.master"

# ─── IDEMPOTENCY GUARD (JD fix) ──────────────────────────────
if (Test-Path $LocalEncFile) {
    Write-Host "=== .env.enc YA EXISTE ===" -ForegroundColor Yellow
    Write-Host "Si quieres regenerarlo, borralo primero:" -ForegroundColor Gray
    Write-Host "  Remove-Item `"$LocalEncFile`" -Force" -ForegroundColor White
    exit 1
}

if (-not (Test-Path $GlobalEncFile)) {
    Write-Error "No se encuentra $GlobalEncFile"
    exit 1
}
if (-not (Test-Path $GlobalMasterKeyFile)) {
    Write-Error "No se encuentra clave maestra global en $GlobalMasterKeyFile"
    exit 1
}
if (-not (Test-Path $LocalEnv)) {
    Write-Error "No se encuentra $LocalEnv"
    exit 1
}

# ─── AES-256-CBC DECRYPT (same as secret-injector) ──────────
function Decrypt-Env {
    param([string]$CipherText, [string]$Key)
    $parts = $CipherText -split ":", 2
    $keyBytes = [Convert]::FromBase64String($Key)
    $aes = [System.Security.Cryptography.Aes]::Create()
    $aes.KeySize = 256; $aes.BlockSize = 128
    $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
    $aes.Key = $keyBytes
    $aes.IV = [Convert]::FromBase64String($parts[0])
    $ct = [Convert]::FromBase64String($parts[1])
    $decryptor = $aes.CreateDecryptor()
    $plainBytes = $decryptor.TransformFinalBlock($ct, 0, $ct.Length)
    return [System.Text.Encoding]::UTF8.GetString($plainBytes)
}

function Parse-EnvVars {
    param([string]$Text)
    $vars = @{}
    $Text -split "`n" | ForEach-Object {
        if ($_ -match "^\s*([^#=]+)=(.*)") {
            $vars[$matches[1].Trim()] = $matches[2].Trim()
        }
    }
    return $vars
}

# ─── 17 KEYS QUE NECESITA ESTE PROYECTO ─────────────────────
$TargetKeys = @(
    "OPENROUTER_API_KEY",
    "LINKEDIN_CLIENT_ID",
    "LINKEDIN_CLIENT_SECRET",
    "AUTH_SECRET",
    "CAPTCHA_SOLVER_API_KEY",
    "SECOP_BOT_USERNAME",
    "SECOP_BOT_PASSWORD",
    "SECOP_BOT_EMAIL",
    "TELEGRAM_BOT_TOKEN",
    "MP_ACCESS_TOKEN",
    "MP_WEBHOOK_SECRET",
    "AZURE_OCR_KEY",
    "AZURE_OCR_ENDPOINT",
    "CRON_SECRET",
    "RESEND_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY"
)

# ─── STEP 1: DECRYPT GLOBAL .env.enc ────────────────────────
Write-Host "=== Extrayendo claves del .env.enc GLOBAL ===" -ForegroundColor Cyan
$globalKey = (Get-Content $GlobalMasterKeyFile -Raw).Trim()
$globalCipher = (Get-Content $GlobalEncFile -Raw).Trim()
$globalPlain = Decrypt-Env $globalCipher $globalKey
$globalVars = Parse-EnvVars $globalPlain

# ─── STEP 2: READ LOCAL .env ────────────────────────────────
Write-Host "=== Leyendo .env LOCAL ===" -ForegroundColor Cyan
$localContent = Get-Content $LocalEnv -Raw
$localVars = Parse-EnvVars $localContent

# ─── STEP 3: MERGE: global tiene prioridad, local es fallback ──
$mergedLines = @()
$seen = @{}

# Process the 17 target keys
foreach ($key in $TargetKeys) {
    $value = ""
    if ($globalVars.ContainsKey($key) -and $globalVars[$key]) {
        $value = $globalVars[$key]
    } elseif ($localVars.ContainsKey($key) -and $localVars[$key]) {
        $value = $localVars[$key]
    }
    $mergedLines += "$key=$value"
    $seen[$key] = $true
    if ($value) {
        Write-Host "  $key = OK" -ForegroundColor Green
    } else {
        Write-Host "  $key = (vacio)" -ForegroundColor Yellow
    }
}

# ─── STEP 4: WRITE TEMP FULL .env ───────────────────────────
$tempEnv = "$ProjectRoot\.env.full"
$mergedContent = ($mergedLines -join "`n").Trim()
$mergedContent | Set-Content $tempEnv -Encoding UTF8
Write-Host ""

# ─── STEP 5-7: ENCRYPT + CLEANUP (con try-finally) ─────────
try {
    Write-Host "=== Encriptando a .env.enc ===" -ForegroundColor Cyan
    $backupEnv = "$LocalEnv.pre-encrypt"
    Copy-Item $LocalEnv $backupEnv -Force
    Copy-Item $tempEnv $LocalEnv -Force

    & "$ProjectRoot\scripts\secret-injector.ps1" encrypt

    # Restore original .env
    Copy-Item $backupEnv $LocalEnv -Force
} finally {
    # Siempre limpiar archivos temporales (JD fix: no dejar .env.full en error)
    Remove-Item $tempEnv -Force -ErrorAction SilentlyContinue
    Remove-Item $backupEnv -Force -ErrorAction SilentlyContinue
    Remove-Item "$LocalEnv.bak" -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "=== MIGRACION COMPLETADA ===" -ForegroundColor Green
Write-Host "  .env.enc creado en: $LocalEncFile" -ForegroundColor Cyan
Write-Host "  Claves migradas: $($TargetKeys.Count)" -ForegroundColor Cyan
Write-Host ""
Write-Host "VERIFICA que .env no contenga secretos en texto plano:" -ForegroundColor Yellow
Write-Host "  .\scripts\secret-injector.ps1 list" -ForegroundColor White
