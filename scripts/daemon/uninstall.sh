#!/usr/bin/env bash
# Remove o daemon do Agent Flow (systemd no Linux, launchd no macOS) e mata
# todos os processos restantes (servidor + claudes derivados) via kill-all.sh.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

case "$(uname -s)" in
  Linux)
    NAME="agent-flow-daemon"
    systemctl --user disable --now "$NAME.service" 2>/dev/null || true
    rm -f "$HOME/.config/systemd/user/$NAME.service"
    systemctl --user daemon-reload 2>/dev/null || true
    ;;
  Darwin)
    NAME="com.agentflow.daemon"
    PLIST="$HOME/Library/LaunchAgents/$NAME.plist"
    launchctl bootout "gui/$(id -u)/$NAME" 2>/dev/null \
      || launchctl unload -w "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    ;;
  *)
    echo "erro: sistema '$(uname -s)' não suportado — no Windows use uninstall.ps1."
    exit 1
    ;;
esac

bash "$SCRIPT_DIR/kill-all.sh"
echo "Daemon '$NAME' removido e processos encerrados."
