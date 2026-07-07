# Mata todos os processos do Agent Flow:
#   1. a árvore do servidor registrado em ~/.agent-flow/daemon.pid (inclui os
#      claudes filhos ainda pendurados nele);
#   2. instâncias soltas de node rodando agent-flow.js;
#   3. claudes órfãos disparados pelo runner, identificados pela assinatura de
#      api/modules/claude/claude.runner.js (--output-format stream-json +
#      --dangerously-skip-permissions) — sessões claude interativas não batem
#      nessa assinatura e ficam intactas.
# Sempre mata por PID (Stop-Process -Id), nunca por nome: matar node/claude por
# nome derruba processos alheios (ver comentário em claude.runner.js).

$ErrorActionPreference = "SilentlyContinue"
$PidFile = Join-Path $env:USERPROFILE ".agent-flow\daemon.pid"

# Cadeia de ancestrais deste script — nunca matar a si próprio nem quem o chamou
$selfChain = @()
$cur = $PID
for ($i = 0; $i -lt 20 -and $cur; $i++) {
  $selfChain += $cur
  $cur = (Get-CimInstance Win32_Process -Filter "ProcessId = $cur").ParentProcessId
}

function Stop-Tree([int]$ProcessId) {
  if ($selfChain -contains $ProcessId) { return }
  Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" |
    ForEach-Object { Stop-Tree $_.ProcessId }
  Write-Host "matando pid $ProcessId"
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

# 1. árvore do servidor registrado no pidfile
if (Test-Path $PidFile) {
  $srvPid = (Get-Content $PidFile) -join ""
  if ($srvPid -match '^\d+$') { Stop-Tree ([int]$srvPid) }
  Remove-Item $PidFile -Force
}

# 2. instâncias soltas do servidor
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
  Where-Object { $_.CommandLine -like "*agent-flow.js*" } |
  ForEach-Object { Stop-Tree $_.ProcessId }

# 3. claudes órfãos do runner
Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -like "*claude*" -and
    $_.CommandLine -like "*stream-json*" -and
    $_.CommandLine -like "*--dangerously-skip-permissions*"
  } |
  ForEach-Object { Stop-Tree $_.ProcessId }
