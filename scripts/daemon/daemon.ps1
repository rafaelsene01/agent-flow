# Supervisor do Agent Flow. Instala o projeto se preciso (npm install/build),
# sobe o servidor e monitora via GET /api/status. Se o processo morrer ou o
# health check falhar seguidas vezes, roda o kill-all.ps1 (mata o servidor e
# todos os claudes que ele disparou) e reinicia com backoff.
# Auto-update: periodicamente compara a version do package.json local com a do
# remoto (git fetch); se diferir, git pull + build e reinicia na versão nova.
# Instalado como Scheduled Task pelo install.ps1 — não rodar na mão, exceto para debug.
param(
  [int]$Port = 5522,
  [int]$HealthIntervalSec = 15,
  [int]$MaxHealthFailures = 4,
  [int]$UpdateIntervalSec = 600
)

$ErrorActionPreference = "Stop"
$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$StateDir   = Join-Path $env:USERPROFILE ".agent-flow"
$LogFile    = Join-Path $StateDir "daemon.log"
$PidFile    = Join-Path $StateDir "daemon.pid"
$OutLog     = Join-Path $StateDir "server.out.log"
$ErrLog     = Join-Path $StateDir "server.err.log"
$KillScript = Join-Path $PSScriptRoot "kill-all.ps1"

New-Item -ItemType Directory -Force -Path $StateDir | Out-Null

function Log([string]$msg) {
  if ((Test-Path $LogFile) -and (Get-Item $LogFile).Length -gt 5MB) {
    Move-Item -Force $LogFile "$LogFile.old"
  }
  "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" | Add-Content $LogFile
}

function Ensure-Install {
  Push-Location $ProjectDir
  try {
    if (-not (Test-Path "node_modules")) {
      Log "node_modules ausente - rodando npm install"
      cmd /c "npm install >> ""$LogFile"" 2>&1"
      if ($LASTEXITCODE -ne 0) { throw "npm install falhou (exit $LASTEXITCODE)" }
    }
    if (-not (Test-Path "dist\agent-flow.js")) {
      Log "dist ausente - rodando npm run build"
      cmd /c "npm run build >> ""$LogFile"" 2>&1"
      if ($LASTEXITCODE -ne 0) { throw "npm run build falhou (exit $LASTEXITCODE)" }
    }
  } finally {
    Pop-Location
  }
}

# Retorna $true se atualizou (precisa reiniciar o servidor)
function Check-Update {
  Push-Location $ProjectDir
  try {
    if (-not (Test-Path ".git")) { return $false }
    git fetch --quiet origin 2>&1 | Add-Content $LogFile
    if ($LASTEXITCODE -ne 0) { return $false }
    $upstream = git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>$null
    if (-not $upstream) { return $false }
    $localV = (Get-Content package.json -Raw | ConvertFrom-Json).version
    $remoteRaw = (git show "${upstream}:package.json" 2>$null) -join "`n"
    if (-not $remoteRaw) { return $false }
    $remoteV = ($remoteRaw | ConvertFrom-Json).version
    if (-not $localV -or -not $remoteV -or $localV -eq $remoteV) { return $false }
    Log "nova versao disponivel ($localV -> $remoteV) - atualizando"
    cmd /c "git pull --ff-only >> ""$LogFile"" 2>&1"
    if ($LASTEXITCODE -ne 0) { Log "git pull falhou"; return $false }
    cmd /c "npm install >> ""$LogFile"" 2>&1"
    if ($LASTEXITCODE -ne 0) { Log "npm install da atualizacao falhou"; return $false }
    cmd /c "npm run build >> ""$LogFile"" 2>&1"
    if ($LASTEXITCODE -ne 0) { Log "build da atualizacao falhou"; return $false }
    return $true
  } catch {
    Log "check de update falhou: $($_.Exception.Message)"
    return $false
  } finally {
    Pop-Location
  }
}

$backoff = 5
Log "=== daemon iniciado (porta $Port, projeto $ProjectDir) ==="

while ($true) {
  try {
    Ensure-Install
    $proc = Start-Process node -ArgumentList "dist\agent-flow.js", "-p", $Port `
      -WorkingDirectory $ProjectDir -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog
    Set-Content $PidFile $proc.Id
    Log "servidor iniciado (pid $($proc.Id))"

    $failures = 0
    $startedAt = Get-Date
    $lastUpdate = Get-Date
    while ($true) {
      Start-Sleep -Seconds $HealthIntervalSec
      if ($proc.HasExited) {
        Log "servidor saiu sozinho (exit $($proc.ExitCode))"
        break
      }
      try {
        Invoke-WebRequest -Uri "http://127.0.0.1:$Port/api/status" `
          -UseBasicParsing -TimeoutSec 10 | Out-Null
        $failures = 0
        # 5 min saudável zera o backoff de restart
        if (((Get-Date) - $startedAt).TotalMinutes -ge 5) { $backoff = 5 }
      } catch {
        $failures++
        Log "health check falhou ($failures/$MaxHealthFailures): $($_.Exception.Message)"
        if ($failures -ge $MaxHealthFailures) { break }
      }
      if (((Get-Date) - $lastUpdate).TotalSeconds -ge $UpdateIntervalSec) {
        $lastUpdate = Get-Date
        if (Check-Update) {
          Log "reiniciando para aplicar atualizacao"
          break
        }
      }
    }
  } catch {
    Log "erro: $($_.Exception.Message)"
  }

  # Preserva o final do output do servidor antes do restart sobrescrever os logs
  foreach ($f in @($OutLog, $ErrLog)) {
    if (Test-Path $f) {
      $tail = Get-Content $f -Tail 20 -ErrorAction SilentlyContinue
      if ($tail) {
        Log "--- tail de $(Split-Path -Leaf $f) ---"
        $tail | Add-Content $LogFile
      }
    }
  }

  Log "matando servidor e claudes derivados (kill-all.ps1)"
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $KillScript 2>&1 | Add-Content $LogFile
  Log "reiniciando em ${backoff}s"
  Start-Sleep -Seconds $backoff
  $backoff = [Math]::Min($backoff * 2, 60)
}
