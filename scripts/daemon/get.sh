#!/usr/bin/env bash
# Bootstrap do Agent Flow: baixa o repo e instala o daemon numa linha.
#   curl -fsSL https://raw.githubusercontent.com/rafaelsene01/agent-flow/master/scripts/daemon/get.sh | bash
# Porta customizada:
#   curl -fsSL .../get.sh | bash -s -- 8080
# Clona/atualiza em ~/.agent-flow/app e delega ao install.sh (Linux/macOS)
# ou install.ps1 (Git Bash no Windows).
set -e

PORT="${1:-5522}"
REPO="https://github.com/rafaelsene01/agent-flow.git"
APP_DIR="$HOME/.agent-flow/app"
NODE_DIR="$HOME/.agent-flow/node"

need() {
  command -v "$1" > /dev/null 2>&1 || { echo "erro: '$1' não encontrado — instale antes."; exit 1; }
}
need git
need curl

node_ok() {
  command -v node > /dev/null 2>&1 || return 1
  [ "$(node -v | sed 's/^v\([0-9]*\).*/\1/')" -ge 22 ]
}

# Instala uma cópia local do Node (tarball oficial) em ~/.agent-flow/node —
# sem sudo e independente de distro. O install.sh grava o PATH no serviço,
# então o daemon enxerga esse node.
install_node() {
  case "$(uname -s)" in
    Linux) os=linux ;;
    Darwin) os=darwin ;;
    *) echo "erro: instale Node >= 22 manualmente (https://nodejs.org)."; exit 1 ;;
  esac
  case "$(uname -m)" in
    x86_64) arch=x64 ;;
    aarch64 | arm64) arch=arm64 ;;
    *) echo "erro: arquitetura '$(uname -m)' não suportada — instale Node >= 22 manualmente."; exit 1 ;;
  esac
  tarball="$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt \
    | grep -o "node-v[0-9.]*-$os-$arch\.tar\.gz" | head -n 1)"
  [ -n "$tarball" ] || { echo "erro: não achei o tarball do Node para $os-$arch."; exit 1; }
  echo "Node >= 22 não encontrado — baixando $tarball para $NODE_DIR"
  mkdir -p "$NODE_DIR"
  curl -fsSL "https://nodejs.org/dist/latest-v22.x/$tarball" \
    | tar -xz -C "$NODE_DIR" --strip-components=1
  export PATH="$NODE_DIR/bin:$PATH"
}

# Cópia local de instalação anterior tem prioridade
[ -x "$NODE_DIR/bin/node" ] && export PATH="$NODE_DIR/bin:$PATH"
if ! node_ok; then
  case "$(uname -s)" in
    MINGW* | MSYS* | CYGWIN*)
      echo "erro: Node >= 22 não encontrado — no Windows use o instalador PowerShell:"
      echo "  irm https://raw.githubusercontent.com/rafaelsene01/agent-flow/master/scripts/daemon/get.ps1 | iex"
      exit 1
      ;;
  esac
  install_node
  node_ok || { echo "erro: instalação do Node falhou."; exit 1; }
fi

if [ -d "$APP_DIR/.git" ]; then
  echo "repo já existe em $APP_DIR — atualizando"
  git -C "$APP_DIR" pull --ff-only || echo "aviso: git pull falhou, seguindo com a versão local"
else
  git clone --depth 1 "$REPO" "$APP_DIR"
fi

case "$(uname -s)" in
  Linux | Darwin)
    bash "$APP_DIR/scripts/daemon/install.sh" "$PORT"
    ;;
  MINGW* | MSYS* | CYGWIN*)
    powershell.exe -NoProfile -ExecutionPolicy Bypass \
      -File "$(cygpath -w "$APP_DIR/scripts/daemon/install.ps1")" -Port "$PORT"
    ;;
  *)
    echo "erro: sistema '$(uname -s)' não suportado (daemon requer systemd ou Windows)."
    exit 1
    ;;
esac
