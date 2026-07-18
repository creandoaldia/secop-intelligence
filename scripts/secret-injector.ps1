<#
.SYNOPSIS
  Injector seguro de secretos: encripta .env, inyecta en sesion, y permite
  agregar/modificar credenciales individuales sin desencriptar todo.

.DESCRIPTION
  Sigue el patron del video de Gentleman (t=1:39): usar un script para
  manejar claves sin que queden expuestas en terminal, logs o historial.

  La primera vez crea ~/.config/watch/.env.master (clave maestra AES de 256 bits).
  Luego encripta el .env del proyecto a .env.enc.

  Comandos:
    encrypt            - Encripta .env -> .env.enc (primera vez o recodificar)
    decrypt            - Desencripta .env.enc a temporal para revision manual
    inject             - Carga claves en variables de entorno de la sesion actual
    set KEY=VALUE      - Agrega o actualiza UNA clave sin desencriptar todo
    get KEY            - Muestra una clave (enmascarada)
    list               - Lista todas las claves (enmascaradas)
    edit               - Abre .env.enc en bloc de notas, al cerrar lo recodifica
    path               - Muestra rutas de archivos relevantes

.EXAMPLE
  # Primera vez: encriptar todo
  .\tools\secret-injector.ps1 encrypt

  # Inyectar en sesion actual (MCP, scripts, etc.)
  .\tools\secret-injector.ps1 inject

  # Agregar o actualizar una clave (se encripta automaticamente)
  .\tools\secret-injector.ps1 set GROQ_API_KEY=sk-xxx

  # Ver claves disponibles (siempre enmascaradas)
  .\tools\secret-injector.ps1 list

  # Ver una clave especifica
  .\tools\secret-injector.ps1 get GROQ_API_KEY

  # Editar todo el archivo en bloc de notas
  .\tools\secret-injector.ps1 edit
#>

[CmdletBinding()]
param(
    [Parameter(Position=0)]
    [ValidateSet("encrypt","decrypt","inject","set","remove","get","list","edit","path")]
    [string]$Command = "list",

    [Parameter(Position=1, ValueFromRemainingArguments=$true)]
    [string[]]$Remaining = @(),

    [switch]$Force
)

# Unir argumentos restantes en un solo string
$ArgString = ($Remaining -join " ").Trim()

$ErrorActionPreference = "Stop"

# --- Rutas ---
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$EnvFile = "$ProjectRoot\apps\web\.env"
$EncFile = "$ProjectRoot\.env.enc"
$MasterKeyFile = "$env:USERPROFILE\.config\watch\.env.master.secop-intelligence"
$WatchDir = "$env:USERPROFILE\.config\watch"
$WatchEnv = $null      # No cargar env global — solo proyecto

# --- Funciones auxiliares ---

function Mask-Key {
    param([string]$Value)
    # Standard masking: first 4 + last 4 chars (industry standard, same as GitHub/AWS/Stripe)
    if ([string]::IsNullOrEmpty($Value)) { return "****" }
    if ($Value.Length -le 8) { return "****" }  # Short keys: full mask
    return $Value.Substring(0,4) + "..." + $Value.Substring($Value.Length - 4)
}

function Mask-KeyFull {
    param([string]$Value)
    # Full masking for high-security contexts — no partial reveal
    if ([string]::IsNullOrEmpty($Value)) { return "****" }
    return "****"
}

function Get-MasterKey {
    if (-not (Test-Path $MasterKeyFile)) {
        Write-Host "=== NO HAY CLAVE MAESTRA ===" -ForegroundColor Red
        Write-Host "Ejecuta primero: .\tools\secret-injector.ps1 encrypt" -ForegroundColor Yellow
        exit 1
    }
    return (Get-Content $MasterKeyFile -Raw).Trim()
}

function New-MasterKey {
    if (-not (Test-Path $WatchDir)) {
        New-Item -ItemType Directory -Path $WatchDir -Force | Out-Null
    }
    # Genera 32 bytes aleatorios (AES-256) en base64
    $keyBytes = [byte[]]::new(32)
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($keyBytes)
    $key = [Convert]::ToBase64String($keyBytes)

    # Permisos estrictos: solo el usuario actual
    [System.IO.File]::WriteAllText($MasterKeyFile, $key, [System.Text.Encoding]::ASCII)
    & "icacls" $MasterKeyFile "/inheritance:r" "/grant" "${env:USERNAME}:F" 2>$null

    Write-Host "Clave maestra creada: $MasterKeyFile" -ForegroundColor Green
    Write-Host "Esta clave JAMAS debe compartirse ni subirse a git." -ForegroundColor Yellow
    return $key
}

function New-AesCrypto {
    param([string]$KeyBase64)
    $keyBytes = [Convert]::FromBase64String($KeyBase64)
    $aes = [System.Security.Cryptography.Aes]::Create()
    $aes.KeySize = 256
    $aes.BlockSize = 128
    $aes.Mode = [System.Security.Cryptography.CipherMode]::CBC
    $aes.Key = $keyBytes
    return $aes
}

function Encrypt-Env {
    param([string]$PlainText, [string]$Key)
    $aes = New-AesCrypto $Key
    try {
        $aes.GenerateIV()
        $encryptor = $aes.CreateEncryptor()
        $plainBytes = [System.Text.Encoding]::UTF8.GetBytes($PlainText)
        $encBytes = $encryptor.TransformFinalBlock($plainBytes, 0, $plainBytes.Length)
        $ivB64 = [Convert]::ToBase64String($aes.IV)
        $ctB64 = [Convert]::ToBase64String($encBytes)
        return "${ivB64}:${ctB64}"
    } finally {
        if ($aes -and $aes.Dispose) { $aes.Dispose() }
    }
}

function Decrypt-Env {
    param([string]$CipherText, [string]$Key)
    $parts = $CipherText -split ":", 2
    $aes = New-AesCrypto $Key
    try {
        $aes.IV = [Convert]::FromBase64String($parts[0])
        $ct = [Convert]::FromBase64String($parts[1])
        $decryptor = $aes.CreateDecryptor()
        $plainBytes = $decryptor.TransformFinalBlock($ct, 0, $ct.Length)
        return [System.Text.Encoding]::UTF8.GetString($plainBytes)
    } finally {
        if ($aes -and $aes.Dispose) { $aes.Dispose() }
    }
}

function Get-EnvContent {
    # Lee variables del .env original (si existe) o del ~/.config/watch/.env
    $vars = @{}
    $sources = @()

    if (Test-Path $EncFile) {
        try {
            $key = Get-MasterKey
            $decrypted = Decrypt-Env (Get-Content $EncFile -Raw).Trim() $key
            $decrypted -split "`n" | ForEach-Object {
                if ($_ -match "^\s*([^#=]+)=(.*)") {
                    $vars[$matches[1].Trim()] = $matches[2].Trim()
                }
            }
            $sources += $EncFile
        } catch {
            Write-Host "ERROR al desencriptar $EncFile : $_" -ForegroundColor Red
        }
    }

    if ($WatchEnv -and (Test-Path $WatchEnv)) {
        Get-Content $WatchEnv | Where-Object { $_ -match "=" -and $_ -notmatch "^\s*#" } | ForEach-Object {
            $parts = $_ -split "=", 2
            $k = $parts[0].Trim()
            $v = $parts[1].Trim()
            $vars[$k] = $v
        }
        $sources += $WatchEnv
    }

    # Process env vars sobreescriben
    $keyNames = @($vars.Keys)
    foreach ($k in $keyNames) {
        $envVal = [Environment]::GetEnvironmentVariable($k, "Process")
        if ($envVal) { $vars[$k] = $envVal; $sources += "process" }
    }

    return @{ Vars = $vars; Sources = $sources | Select-Object -Unique }
}

# --- Comandos ---

function Invoke-Encrypt {
    if (-not (Test-Path $EnvFile)) {
        Write-Host "No existe $EnvFile" -ForegroundColor Yellow
        Write-Host "Crea primero tu .env o usa: .\scripts\secret-injector.ps1 set KEY=VALUE" -ForegroundColor Yellow
        exit 1
    } else {
        $content = Get-Content $EnvFile -Raw
    }

    if (-not (Test-Path $MasterKeyFile)) {
        Write-Host "Generando clave maestra por primera vez..." -ForegroundColor Cyan
        $key = New-MasterKey
    } else {
        $key = Get-MasterKey
    }

    $encrypted = Encrypt-Env $content $key
    $encrypted | Set-Content $EncFile -Encoding UTF8 -NoNewline

    Write-Host "=== ARCHIVO ENCRIPTADO CREADO ===" -ForegroundColor Green
    Write-Host "Origen: $EnvFile" -ForegroundColor Cyan
    Write-Host "Destino: $EncFile" -ForegroundColor Cyan

    # Si encriptamos desde .env, lo renombramos a .env.bak como respaldo
    if (Test-Path $EnvFile) {
        Copy-Item $EnvFile "$EnvFile.bak" -Force
        Write-Host "Respaldo: $EnvFile.bak" -ForegroundColor Gray
        Write-Host ""
        Write-Host "AHORA PUEDES BORRAR .env (opcional pero recomendado):" -ForegroundColor Yellow
        Write-Host "  Remove-Item $EnvFile" -ForegroundColor White
        Write-Host ""
        Write-Host "O dejarlo como respaldo, pero NUNCA lo subas a git." -ForegroundColor Yellow
    }
}

function Invoke-Decrypt {
    if (-not (Test-Path $EncFile)) {
        Write-Host "No existe $EncFile" -ForegroundColor Red
        Write-Host "Ejecuta primero: .\tools\secret-injector.ps1 encrypt" -ForegroundColor Yellow
        exit 1
    }

    # Safety gate: require Force flag or interactive confirmation
    if (-not $Force) {
        Write-Host ""
        Write-Host "!!! PELIGRO: Esto mostrara TODOS los secretos en texto plano. !!!" -ForegroundColor Red
        Write-Host "!!! Esto incluye API keys, tokens, passwords, y credenciales.     !!!" -ForegroundColor Red
        Write-Host ""
        Write-Host "Usa -Force para omitir esta confirmacion (solo en automatizaciones seguras)." -ForegroundColor Yellow
        Write-Host ""
        $confirm = Read-Host "Escribe 'yes' para continuar, cualquier otra cosa para cancelar"
        if ($confirm -ne "yes") {
            Write-Host "Operacion cancelada." -ForegroundColor Yellow
            exit 0
        }
    }

    $key = Get-MasterKey
    $decrypted = Decrypt-Env (Get-Content $EncFile -Raw).Trim() $key
    Write-Host "=== CONTENIDO DESENCRIPTADO ===" -ForegroundColor Cyan
    Write-Host "PELIGRO: Este output contiene secretos. Cierra esta terminal o limpia el historial despues de usar." -ForegroundColor Red
    Write-Host $decrypted
}

function Invoke-Inject {
    $state = Get-EnvContent
    $count = 0
    foreach ($k in $state.Vars.Keys) {
        [Environment]::SetEnvironmentVariable($k, $state.Vars[$k], "Process")
        $count++
    }

    # -- SSH key handling: decode VPS_SSH_KEY to temp file --
    if ($state.Vars.ContainsKey("VPS_SSH_KEY") -and $state.Vars["VPS_SSH_KEY"]) {
        $tempPath = "$env:TEMP\wafle-ssh-key-$PID"
        try {
            $b64 = $state.Vars["VPS_SSH_KEY"]
            $pemBytes = [Convert]::FromBase64String($b64)
            # Write once as ASCII text: no BOM, no CRLF munging, clean on partial crash
            $pemText = [Text.Encoding]::ASCII.GetString($pemBytes)
            [System.IO.File]::WriteAllText($tempPath, $pemText, [Text.Encoding]::ASCII)

            # Secure permissions: user-only
            & "icacls" $tempPath "/inheritance:r" "/grant" "${env:USERNAME}:F" 2>$null
            if (-not $?) {
                Remove-Item $tempPath -Force -ErrorAction SilentlyContinue
                throw "icacls failed to set permissions on SSH temp key: $tempPath"
            }

            [Environment]::SetEnvironmentVariable("SSH_KEY_PATH", $tempPath, "Process")

            # CLEANUP: catch removes temp file on error
            # CLEANUP: Register-EngineEvent removes on normal exit
            $cleanupPath = $tempPath
            $null = Register-EngineEvent PowerShell.Exiting -Action {
                if ($cleanupPath -and (Test-Path $cleanupPath)) {
                    Remove-Item $cleanupPath -Force -ErrorAction SilentlyContinue
                }
            } -SupportEvent

            Write-Host "  SSH key decrypted -> ***" -ForegroundColor Green
            Write-Host "  SSH_KEY_PATH set (auto-cleaned on exit)" -ForegroundColor Gray
        } catch {
            Write-Host "  ERROR: SSH key injection failed: $_" -ForegroundColor Red
            if ($tempPath -and (Test-Path $tempPath)) { Remove-Item $tempPath -Force }
        }
    }

    Write-Host "=== CLAVES INYECTADAS EN SESION ===" -ForegroundColor Green
    Write-Host "$count variables de entorno cargadas desde:" -ForegroundColor Cyan
    $state.Sources | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
    if ($state.Vars.ContainsKey("VPS_SSH_KEY")) {
        Write-Host "  SSH key: ***" -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host "Las claves estan disponibles para esta sesion de PowerShell." -ForegroundColor White
    Write-Host "NO persisten al cerrar la terminal. Vuelve a ejecutar inject si abres otra." -ForegroundColor Yellow
}

function Invoke-Set {
    if (-not $ArgString -or $ArgString -notmatch "=") {
        Write-Host "Uso: .\tools\secret-injector.ps1 set KEY=VALUE" -ForegroundColor Yellow
        Write-Host "  Ejemplo: .\tools\secret-injector.ps1 set GROQ_API_KEY=sk-nueva-clave" -ForegroundColor White
        exit 1
    }

    $parts = $ArgString -split "=", 2
    $key = $parts[0].Trim()
    $value = $parts[1].Trim()

    if (-not $value) {
        Write-Error "El valor no puede estar vacio. Usa edit para borrar claves."
        exit 1
    }

    # Asegurar que existe master key
    if (-not (Test-Path $MasterKeyFile)) {
        Write-Host "No hay clave maestra. Creando..." -ForegroundColor Cyan
        New-MasterKey | Out-Null
    }

    # Si no existe .env.enc, crearlo
    if (-not (Test-Path $EncFile)) {
        Write-Host "No existe $EncFile. Se creara con esta clave." -ForegroundColor Yellow
        $dummy = "$key=$value`n"
        $enc = Encrypt-Env $dummy (Get-MasterKey)
        $enc | Set-Content $EncFile -Encoding UTF8 -NoNewline
        Write-Host "Clave '$key' guardada en $EncFile" -ForegroundColor Green
        Write-Host "Valor: $(Mask-Key $value)" -ForegroundColor Green
        return
    }

    # Leer, modificar, re-encriptar
    $k = Get-MasterKey
    $encrypted = Get-Content $EncFile -Raw
    $decrypted = Decrypt-Env $encrypted.Trim() $k

    $lines = $decrypted -split "`n"
    $updated = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^$key\s*=") {
            $lines[$i] = "$key=$value"
            $updated = $true
            break
        }
    }
    if (-not $updated) {
        $lines += "$key=$value"
    }

    $newContent = ($lines -join "`n").Trim()
    $reEncrypted = Encrypt-Env $newContent $k
    $reEncrypted | Set-Content $EncFile -Encoding UTF8 -NoNewline

    # Inyectar en sesion actual
    [Environment]::SetEnvironmentVariable($key, $value, "Process")

    Write-Host "Clave '$key' guardada en $EncFile" -ForegroundColor Green
    Write-Host "Valor: $(Mask-Key $value)" -ForegroundColor Green
    Write-Host "Tambien inyectada en la sesion actual." -ForegroundColor Gray
}

function Invoke-Get {
    if (-not $ArgString) {
        Write-Host "Uso: .\tools\secret-injector.ps1 get KEY" -ForegroundColor Yellow
        exit 1
    }
    $key = $ArgString.Trim()
    $state = Get-EnvContent

    if ($state.Vars.ContainsKey($key)) {
        Write-Host "$key = $(Mask-Key $state.Vars[$key])" -ForegroundColor Cyan
    } else {
        Write-Host "Clave '$key' no encontrada en ninguna fuente." -ForegroundColor Red
        exit 1
    }
}

function Invoke-List {
    Write-Host ""
    Write-Host "=== CLAVES DISPONIBLES (siempre enmascaradas) ===" -ForegroundColor Cyan
    $state = Get-EnvContent

    if ($state.Vars.Count -eq 0) {
        Write-Host "No hay claves configuradas." -ForegroundColor Yellow
        Write-Host "Usa: .\tools\secret-injector.ps1 set KEY=VALUE" -ForegroundColor Gray
        return
    }

    $state.Vars.Keys | Sort-Object | ForEach-Object {
        Write-Host "  $_ = $(Mask-Key $state.Vars[$_])"
    }

    Write-Host ""
    Write-Host "Fuentes:" -ForegroundColor Gray
    $state.Sources | ForEach-Object { Write-Host "  - $_" -ForegroundColor Gray }
}

function Invoke-Edit {
    if (-not (Test-Path $EncFile)) {
        Write-Host "No existe $EncFile" -ForegroundColor Red
        Write-Host "Ejecuta primero: .\tools\secret-injector.ps1 encrypt" -ForegroundColor Yellow
        exit 1
    }

    $k = Get-MasterKey
    $encrypted = Get-Content $EncFile -Raw
    $decrypted = Decrypt-Env $encrypted.Trim() $k

    $tmpFile = "$env:TEMP\.env-tmp-$PID"
    $decrypted | Set-Content $tmpFile -Encoding UTF8

    Write-Host "Abriendo bloc de notas para editar .env.enc ..." -ForegroundColor Cyan
    Write-Host "GUARDA Y CIERRA el archivo cuando termines." -ForegroundColor Yellow
    notepad $tmpFile | Out-Null

    $newContent = (Get-Content $tmpFile -Raw).Trim()
    if ($newContent -eq $decrypted.Trim()) {
        Write-Host "Sin cambios." -ForegroundColor Gray
    } else {
        $reEncrypted = Encrypt-Env $newContent $k
        $reEncrypted | Set-Content $EncFile -Encoding UTF8 -NoNewline
        Write-Host "Cambios guardados y re-encriptados." -ForegroundColor Green
    }

    Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue
}

function Invoke-Remove {
    if (-not $ArgString) {
        Write-Host "Uso: .\tools\secret-injector.ps1 remove KEY" -ForegroundColor Yellow
        Write-Host "  Ejemplo: .\tools\secret-injector.ps1 remove OLD_API_KEY" -ForegroundColor White
        exit 1
    }
    $key = $ArgString.Trim()

    if (-not (Test-Path $EncFile)) {
        Write-Host "No existe $EncFile" -ForegroundColor Red
        exit 1
    }

    $k = Get-MasterKey
    $encrypted = Get-Content $EncFile -Raw
    $decrypted = Decrypt-Env $encrypted.Trim() $k

    $lines = $decrypted -split "`n"
    $newLines = $lines | Where-Object { $_ -notmatch "^$key\s*=" }
    $removed = ($newLines.Count -ne $lines.Count)

    if (-not $removed) {
        Write-Host "Clave '$key' no encontrada en $EncFile" -ForegroundColor Yellow
        exit 1
    }

    $newContent = ($newLines -join "`n").Trim()
    $reEncrypted = Encrypt-Env $newContent $k
    $reEncrypted | Set-Content $EncFile -Encoding UTF8 -NoNewline

    Write-Host "Clave '$key' eliminada de $EncFile" -ForegroundColor Green
}

function Invoke-Path {
    Write-Host ""
    Write-Host "=== RUTAS DE ARCHIVOS DE SECRETOS ===" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "[ENCRIPTADO] $EncFile" -ForegroundColor Green
    if (Test-Path $EncFile) { Write-Host "  EXISTE ($((Get-Item $EncFile).Length) bytes)" -ForegroundColor Green }
    else { Write-Host "  NO EXISTE" -ForegroundColor Yellow }
    Write-Host ""
    Write-Host "[CLAVE MAESTRA] $MasterKeyFile" -ForegroundColor Green
    if (Test-Path $MasterKeyFile) { Write-Host "  EXISTE" -ForegroundColor Green }
    else { Write-Host "  NO EXISTE" -ForegroundColor Yellow }
    Write-Host ""
    Write-Host "[RESPALDO] $EnvFile.bak" -ForegroundColor Yellow
    if (Test-Path "$EnvFile.bak") { Write-Host "  EXISTE" -ForegroundColor Yellow }
    else { Write-Host "  NO EXISTE" -ForegroundColor Gray }
    Write-Host ""
    Write-Host "[SEGURO ADICIONAL] WatchEnv (disabled)" -ForegroundColor Cyan
    Write-Host "  DESHABILITADO — solo usa .env.enc del proyecto" -ForegroundColor Gray
}

# --- Dispatch ---
switch ($Command) {
    "encrypt" { Invoke-Encrypt }
    "decrypt" { Invoke-Decrypt }
    "inject"  { Invoke-Inject }
    "set"     { Invoke-Set }
    "remove"  { Invoke-Remove }
    "get"     { Invoke-Get }
    "list"    { Invoke-List }
    "edit"    { Invoke-Edit }
    "path"    { Invoke-Path }
}

Write-Host ""
Write-Host "--- secret-injector end ---" -ForegroundColor Gray
exit 0
