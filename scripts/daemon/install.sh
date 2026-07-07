#!/usr/bin/env bash
# Instala o daemon do Agent Flow:
#   Linux → serviço systemd de usuário (sobe no boot via linger)
#   macOS → LaunchAgent do launchd (sobe no login; KeepAlive reinicia o supervisor)
# Inicia imediatamente após registrar. O PATH atual é gravado no serviço para
# que node/npm de nvm/homebrew continuem visíveis fora do shell interativo.
set -e

PORT="${1:-5522}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

case "$(uname -s)" in
  Linux)
    SERVICE="agent-flow-daemon"
    UNIT_DIR="$HOME/.config/systemd/user"
    mkdir -p "$UNIT_DIR"
    cat > "$UNIT_DIR/$SERVICE.service" <<EOF
[Unit]
Description=Agent Flow daemon (supervisor)
After=network-online.target

[Service]
Environment=PATH=$PATH
ExecStart=/usr/bin/env bash "$SCRIPT_DIR/daemon.sh" $PORT
Restart=always
RestartSec=10

[Install]
WantedBy=default.target
EOF
    systemctl --user daemon-reload
    systemctl --user enable --now "$SERVICE.service"
    # linger: serviços de usuário sobem no boot mesmo sem login
    loginctl enable-linger "$USER" 2>/dev/null || true
    echo "Daemon '$SERVICE' instalado e iniciado (porta $PORT)."
    echo "Logs: $HOME/.agent-flow/daemon.log (e journalctl --user -u $SERVICE)"
    ;;
  Darwin)
    LABEL="com.agentflow.daemon"
    PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
    mkdir -p "$HOME/Library/LaunchAgents"
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>$SCRIPT_DIR/daemon.sh</string>
    <string>$PORT</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$PATH</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
EOF
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load -w "$PLIST"
    echo "Daemon '$LABEL' instalado e iniciado (porta $PORT)."
    echo "Logs: $HOME/.agent-flow/daemon.log"
    ;;
  *)
    echo "erro: sistema '$(uname -s)' não suportado — no Windows use install.ps1."
    exit 1
    ;;
esac
