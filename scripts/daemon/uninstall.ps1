# Remove o daemon do Agent Flow: para e desregistra a Scheduled Task e mata
# todos os processos restantes (servidor + claudes derivados) via kill-all.ps1.
param([string]$TaskName = "AgentFlowDaemon")

$ErrorActionPreference = "SilentlyContinue"
Stop-ScheduledTask -TaskName $TaskName
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "kill-all.ps1")
Write-Host "Daemon '$TaskName' removido e processos encerrados."
