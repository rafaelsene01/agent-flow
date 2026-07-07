# Instala o daemon do Agent Flow como Scheduled Task do usuário atual:
# inicia no logon, roda escondido e é reiniciado pelo Task Scheduler se o
# supervisor (daemon.ps1) morrer. Inicia a task imediatamente após registrar.
param(
  [int]$Port = 5522,
  [string]$TaskName = "AgentFlowDaemon"
)

$ErrorActionPreference = "Stop"
$daemon = Join-Path $PSScriptRoot "daemon.ps1"

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$daemon`" -Port $Port"
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

Write-Host "Daemon '$TaskName' instalado e iniciado (porta $Port)."
Write-Host "Logs: $env:USERPROFILE\.agent-flow\daemon.log"
