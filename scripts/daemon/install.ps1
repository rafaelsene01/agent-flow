# Instala o daemon do Agent Flow como Scheduled Task do usuário atual:
# inicia no logon, roda escondido e é reiniciado pelo Task Scheduler se o
# supervisor (daemon.ps1) morrer. Inicia a task imediatamente após registrar.
param(
  [int]$Port = 5522,
  [string]$TaskName = "AgentFlowDaemon"
)

$ErrorActionPreference = "Stop"
$daemon = Join-Path $PSScriptRoot "daemon.ps1"

# conhost --headless: sem janela e sem delegar pro Windows Terminal, que ignora
# o -WindowStyle Hidden de tarefas agendadas e deixaria um terminal aberto no logon.
$action = New-ScheduledTaskAction -Execute "$env:windir\System32\conhost.exe" `
  -Argument "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$daemon`" -Port $Port"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Force | Out-Null
# Reinstalação sobre daemon rodando: derruba o supervisor antigo e os processos
# dele antes de subir o novo, senão o servidor velho segura a porta.
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "kill-all.ps1") | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host "Daemon '$TaskName' instalado e iniciado (porta $Port)."
Write-Host "Logs: $env:USERPROFILE\.agent-flow\daemon.log"
