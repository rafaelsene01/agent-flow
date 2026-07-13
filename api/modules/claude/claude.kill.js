import { spawn } from "child_process";

const isWin = process.platform === "win32";

// Delay antes do SIGKILL de fallback: dá tempo do claude e seus filhos
// fecharem em resposta ao SIGTERM antes de forçar.
const FORCE_KILL_DELAY_MS = 5000;

/**
 * Mata o processo `claude` e TODA a sua descendência (tools, bash, MCP servers).
 *
 * Um `child.kill("SIGTERM")` atinge só o processo direto — os netos que o claude
 * abre ficam órfãos (reparentados ao init) e vazam. Aqui derrubamos o grupo de
 * processos inteiro, com SIGKILL de fallback caso algo ignore o SIGTERM.
 *
 * Requer que o processo tenha sido criado com `detached: true` no Unix, para
 * virar líder do próprio grupo — assim `process.kill(-pid)` atinge o grupo todo.
 *
 * @param {import("child_process").ChildProcess | null | undefined} child
 */
export function killTree(child) {
  if (!child || child.pid == null) return;
  if (child.exitCode !== null || child.killed) return;
  const pid = child.pid;

  if (isWin) {
    // Sem grupo POSIX no Windows; taskkill /T derruba a árvore inteira.
    // (O deny de taskkill em KILL_DENY_RULES vale para as tools do próprio
    // claude, não para o processo node do servidor.)
    try {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        windowsHide: true,
      });
    } catch (_) {}
    return;
  }

  // Unix: PID negativo = grupo de processos inteiro.
  try {
    process.kill(-pid, "SIGTERM");
  } catch (_) {
    // ESRCH: grupo já morreu. Nada a fazer.
    return;
  }

  // Fallback: se em alguns segundos ainda estiver vivo, força SIGKILL no grupo.
  setTimeout(() => {
    if (child.exitCode !== null || child.killed) return;
    try {
      process.kill(-pid, "SIGKILL");
    } catch (_) {}
  }, FORCE_KILL_DELAY_MS).unref();
}
