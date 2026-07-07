#!/usr/bin/env bash
# Supervisor do Agent Flow (Linux/macOS). Instala o projeto se preciso (npm
# install/build), sobe o servidor e monitora via GET /api/status. Se o processo
# morrer ou o health check falhar seguidas vezes, roda o kill-all.sh (mata o
# servidor e todos os claudes que ele disparou) e reinicia com backoff.
# Auto-update: periodicamente compara a version do package.json local com a do
# remoto (git fetch); se diferir, git pull + build e reinicia na versão nova.
# Instalado como serviço (systemd no Linux, launchd no macOS) pelo install.sh —
# não rodar na mão, exceto para debug.

PORT="${1:-5522}"
HEALTH_INTERVAL=15
MAX_FAILURES=4
UPDATE_INTERVAL=600

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
STATE_DIR="$HOME/.agent-flow"
LOG="$STATE_DIR/daemon.log"
PIDFILE="$STATE_DIR/daemon.pid"
OUT="$STATE_DIR/server.out.log"
ERR="$STATE_DIR/server.err.log"

mkdir -p "$STATE_DIR"

log() {
  if [ -f "$LOG" ] && [ "$(wc -c < "$LOG" 2>/dev/null || echo 0)" -gt 5242880 ]; then
    mv -f "$LOG" "$LOG.old"
  fi
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"
}

ensure_install() {
  cd "$PROJECT_DIR" || return 1
  if [ ! -d node_modules ]; then
    log "node_modules ausente - rodando npm install"
    npm install >> "$LOG" 2>&1 || { log "npm install falhou (exit $?)"; return 1; }
  fi
  if [ ! -f dist/agent-flow.js ]; then
    log "dist ausente - rodando npm run build"
    npm run build >> "$LOG" 2>&1 || { log "npm run build falhou (exit $?)"; return 1; }
  fi
}

# Retorna 0 se atualizou (precisa reiniciar o servidor); 1 se não há nada a fazer
check_update() {
  cd "$PROJECT_DIR" || return 1
  git rev-parse --git-dir > /dev/null 2>&1 || return 1
  git fetch --quiet origin >> "$LOG" 2>&1 || return 1
  upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)"
  [ -n "$upstream" ] || return 1
  local_v="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' package.json | head -n 1)"
  remote_v="$(git show "$upstream:package.json" 2>/dev/null \
    | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' | head -n 1)"
  [ -n "$local_v" ] && [ -n "$remote_v" ] && [ "$local_v" != "$remote_v" ] || return 1
  log "nova versão disponível ($local_v -> $remote_v) — atualizando"
  git pull --ff-only >> "$LOG" 2>&1 || { log "git pull falhou"; return 1; }
  npm install >> "$LOG" 2>&1 || { log "npm install da atualização falhou"; return 1; }
  npm run build >> "$LOG" 2>&1 || { log "build da atualização falhou"; return 1; }
  return 0
}

backoff=5
log "=== daemon iniciado (porta $PORT, projeto $PROJECT_DIR) ==="

while true; do
  if ensure_install; then
    node "$PROJECT_DIR/dist/agent-flow.js" -p "$PORT" > "$OUT" 2> "$ERR" &
    srv=$!
    echo "$srv" > "$PIDFILE"
    log "servidor iniciado (pid $srv)"

    failures=0
    started=$(date +%s)
    last_update=$(date +%s)
    while true; do
      sleep "$HEALTH_INTERVAL"
      if ! kill -0 "$srv" 2>/dev/null; then
        log "servidor saiu sozinho"
        break
      fi
      if curl -sf -m 10 "http://127.0.0.1:$PORT/api/status" > /dev/null 2>&1; then
        failures=0
        # 5 min saudável zera o backoff de restart
        [ $(( $(date +%s) - started )) -ge 300 ] && backoff=5
      else
        failures=$((failures + 1))
        log "health check falhou ($failures/$MAX_FAILURES)"
        [ "$failures" -ge "$MAX_FAILURES" ] && break
      fi
      if [ $(( $(date +%s) - last_update )) -ge "$UPDATE_INTERVAL" ]; then
        last_update=$(date +%s)
        if check_update; then
          log "reiniciando para aplicar atualização"
          break
        fi
      fi
    done
  fi

  # Preserva o final do output do servidor antes do restart sobrescrever os logs
  for f in "$OUT" "$ERR"; do
    if [ -s "$f" ]; then
      log "--- tail de $(basename "$f") ---"
      tail -n 20 "$f" >> "$LOG"
    fi
  done

  log "matando servidor e claudes derivados (kill-all.sh)"
  bash "$SCRIPT_DIR/kill-all.sh" >> "$LOG" 2>&1
  log "reiniciando em ${backoff}s"
  sleep "$backoff"
  backoff=$(( backoff * 2 ))
  [ "$backoff" -gt 60 ] && backoff=60
done
