#!/usr/bin/env bash
# Mata todos os processos do Agent Flow (Linux/macOS):
#   1. a árvore do servidor registrado em ~/.agent-flow/daemon.pid (inclui os
#      claudes filhos ainda pendurados nele);
#   2. instâncias soltas de node rodando agent-flow.js;
#   3. claudes órfãos disparados pelo runner, identificados pela assinatura de
#      api/modules/claude/claude.runner.js (--output-format stream-json +
#      --dangerously-skip-permissions) — sessões claude interativas não batem
#      nessa assinatura e ficam intactas.
# Sempre mata por PID, nunca por nome: matar node/claude por nome derruba
# processos alheios (ver comentário em claude.runner.js). SIGTERM primeiro,
# SIGKILL nos sobreviventes.

PIDFILE="$HOME/.agent-flow/daemon.pid"

# Cadeia de ancestrais deste script — nunca matar a si próprio nem quem o chamou
self_chain=" $$ "
cur=$$
for _ in $(seq 1 20); do
  cur="$(ps -o ppid= -p "$cur" 2>/dev/null | tr -d ' ')"
  [ -z "$cur" ] || [ "$cur" -le 1 ] 2>/dev/null && break
  self_chain="$self_chain $cur "
done

in_self_chain() {
  case "$self_chain" in *" $1 "*) return 0 ;; *) return 1 ;; esac
}

targets=""
collect_tree() {
  in_self_chain "$1" && return
  for child in $(pgrep -P "$1" 2>/dev/null); do
    collect_tree "$child"
  done
  targets="$targets $1"
}

# 1. árvore do servidor registrado no pidfile
if [ -f "$PIDFILE" ]; then
  srv="$(tr -dc '0-9' < "$PIDFILE")"
  [ -n "$srv" ] && collect_tree "$srv"
  rm -f "$PIDFILE"
fi

# 2. instâncias soltas do servidor
for pid in $(pgrep -f 'node .*agent-flow\.js' 2>/dev/null); do
  collect_tree "$pid"
done

# 3. claudes órfãos do runner
for pid in $(pgrep -f -- 'claude .*stream-json.*--dangerously-skip-permissions' 2>/dev/null); do
  collect_tree "$pid"
done

targets="$(printf '%s\n' $targets | sort -un)"
[ -z "$targets" ] && exit 0

for pid in $targets; do
  echo "matando pid $pid"
  kill -TERM "$pid" 2>/dev/null
done
sleep 2
for pid in $targets; do
  kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null
done
exit 0
