# Bootstrap do Agent Flow (Windows): baixa o repo e instala o daemon numa linha.
#   irm https://raw.githubusercontent.com/rafaelsene01/agent-flow/master/scripts/daemon/get.ps1 | iex
# Porta customizada (iex não aceita parâmetros):
#   $env:AGENT_FLOW_PORT = 8080; irm .../get.ps1 | iex
# Clona/atualiza em %USERPROFILE%\.agent-flow\app e delega ao install.ps1.
$ErrorActionPreference = "Stop"

$Repo   = "https://github.com/rafaelsene01/agent-flow.git"
$AppDir = Join-Path $env:USERPROFILE ".agent-flow\app"
$Port   = if ($env:AGENT_FLOW_PORT) { [int]$env:AGENT_FLOW_PORT } else { 5522 }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw "'git' não encontrado - instale antes."
}

# Precisa casar com "engines" do package.json (>= 22.5, node:sqlite)
function Test-NodeOk {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $false }
  $v = (node -v) -replace '^v', ''
  return [version]$v -ge [version]"22.5.0"
}

if (-not (Test-NodeOk)) {
  Write-Host "Node >= 22 não encontrado - instalando via winget"
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "winget não disponível - instale Node >= 22 manualmente: https://nodejs.org"
  }
  # Catálogo desatualizado do winget entrega LTS antiga (< 22.5) — atualiza antes
  winget source update | Out-Null
  winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) { throw "winget install do Node falhou (exit $LASTEXITCODE)" }
  # recarrega o PATH da sessão atual para enxergar o node recém-instalado
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
    [Environment]::GetEnvironmentVariable("Path", "User")
  if (-not (Test-NodeOk)) {
    if (Get-Command node -ErrorAction SilentlyContinue) {
      throw "winget instalou Node $(node -v), mas o projeto exige >= 22.5 - instale manualmente: https://nodejs.org"
    }
    throw "Node instalado mas não encontrado no PATH - abra um novo terminal e rode o comando de novo."
  }
}

if (Test-Path (Join-Path $AppDir ".git")) {
  Write-Host "repo já existe em $AppDir - atualizando"
  git -C $AppDir fetch origin
  if ($LASTEXITCODE -ne 0) {
    Write-Host "aviso: git fetch falhou, seguindo com a versão local"
  } else {
    $before = git -C $AppDir rev-parse HEAD
    # Clone dedicado do daemon: descarta qualquer mudança local para o update nunca travar
    git -C $AppDir reset --hard '@{u}' | Out-Null
    if ((git -C $AppDir rev-parse HEAD) -ne $before) {
      # dist é da versão antiga — remove para o supervisor rebuildar no boot
      Remove-Item -Recurse -Force (Join-Path $AppDir "dist") -ErrorAction SilentlyContinue
    }
  }
} else {
  git clone --depth 1 $Repo $AppDir
  if ($LASTEXITCODE -ne 0) { throw "git clone falhou" }
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass `
  -File (Join-Path $AppDir "scripts\daemon\install.ps1") -Port $Port
