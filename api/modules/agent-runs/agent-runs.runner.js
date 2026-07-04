import { execFile } from "child_process";
import { promisify } from "util";
import {
  runClaude,
  resumeClaude,
  createRunLog,
  failureDetail,
} from "../claude/claude.runner.js";
import { setupWorktree } from "../git/git.worktree.js";
import { buildAgentPrompt, getAgent } from "../agents/agents.service.js";
import { getLanguage } from "../config/config.service.js";
import {
  registerProcess,
  unregisterProcess,
} from "../claude/claude.concurrency.js";
import {
  patchRun,
  appendTurn,
  updateLastExecTurn,
} from "./agent-runs.store.js";

const execFileP = promisify(execFile);

// Instrução injetada nos prompts que precisam interromper a execução quando
// falta uma decisão do usuário sem padrão razoável (copiado de routes/config/runner.js).
const ASK_RULES =
  "Se faltar uma decisão do usuário e não houver padrão razoável, " +
  "NÃO tente adivinhar — pare a implementação e emita, como ÚLTIMAS linhas " +
  "da resposta, exatamente `ASK: <pergunta objetiva>`. " +
  "Se fizer sentido oferecer alternativas prontas para o usuário escolher, " +
  "liste-as logo abaixo do ASK, uma por linha começando com `- ` (ex.: `- PostgreSQL`). " +
  "O usuário ainda poderá digitar texto livre. Sem alternativas, use só a linha `ASK:`. " +
  "Caso contrário, implemente sem perguntar. Emita no máximo um ASK por resposta.";

function langInstruction() {
  return getLanguage() === "pt"
    ? "Responda em português do Brasil.\n\n"
    : "Respond in English.\n\n";
}

// Interceptor de git: para agentes NÃO git-capazes, removemos qualquer menção às
// palavras "commit"/"push" (e variações em pt: commitar, comitar, pushar…) do
// prompt/skill do agente, para que ele não seja instruído a versionar. O único
// agente isento é o Commit & Push (allowGit: true). Ver buildPrompt/gitRule.
const GIT_WORDS_RE =
  /\b(commit\w*|push\w*|comit(?:ar|ando|ad[oa]s?|em?|ei|ou|amos|aram))\b/gi;

function stripGitWords(text) {
  return (
    (text ?? "")
      .replace(GIT_WORDS_RE, "")
      // limpa espaços/pontuação órfãos deixados pela remoção
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+([,.;:!?])/g, "$1")
      .replace(/[ \t]+\n/g, "\n")
  );
}

function extractFinalText(rawOutput) {
  let finalText = "";
  for (const line of (rawOutput ?? "").split("\n")) {
    const s = line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").trim();
    if (!s) continue;
    try {
      const ev = JSON.parse(s);
      if (ev.type === "result" && typeof ev.result === "string") {
        finalText = ev.result;
      } else if (
        ev.type === "assistant" &&
        Array.isArray(ev.message?.content)
      ) {
        for (const block of ev.message.content) {
          if (block.type === "text" && block.text?.trim())
            finalText = block.text;
        }
      }
    } catch {
      // linha não-JSON — ignora
    }
  }
  return finalText;
}

// Retorna { question, options } a partir do último marcador ASK:, ou null.
// Alternativas = linhas seguintes começando com "- " (até a primeira linha que não é opção).
function parseAsk(finalText) {
  const text = finalText ?? "";
  const lines = text.split("\n");
  // O modelo às vezes envolve o marcador em markdown (ex.: `**ASK:**`). Removemos
  // marcadores de ênfase/lista/citação do início da linha antes de detectar o `ASK:`.
  const stripMd = (l) => l.replace(/^[\s>*_#-]+/, "");
  let lastIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^ASK:/.test(stripMd(lines[i]))) lastIdx = i;
  }
  if (lastIdx === -1) return null;

  const askLine = stripMd(lines[lastIdx]).replace(/^ASK:\**\s*/, "").trim();
  const questionParts = [askLine];
  const options = [];
  let collectingOptions = false;
  for (let i = lastIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    const opt = raw.match(/^\s*[-*]\s+(.+)$/);
    if (opt) {
      collectingOptions = true;
      options.push(opt[1].trim());
    } else if (!collectingOptions && raw.trim()) {
      // pergunta com múltiplas linhas antes de qualquer opção
      questionParts.push(raw.trim());
    } else if (collectingOptions) {
      break; // opções terminaram
    }
  }
  const question = questionParts.join("\n").trim();
  if (!question) return null;
  return { question, options };
}

function buildCardText(run) {
  return [
    `# ${run.card_title ?? "Card"}`,
    "",
    run.card_number != null ? `**Card:** #${run.card_number}` : null,
    `**Branch:** \`${run.target_branch}\``,
    "",
    "---",
    "",
    run.card_body?.trim() || "_Sem descrição._",
  ]
    .filter((l) => l !== null)
    .join("\n");
}

// Regra anti-kill: vai no prompt inicial (buildPrompt) e é repetida em todo
// resume, porque sessões antigas foram criadas antes da regra existir e o
// resume manda só a mensagem do usuário. O bloqueio duro fica nas deny rules
// do claude.runner; aqui é a orientação para o agente nem tentar.
const PROCESS_KILL_RULE =
  "- NUNCA encerre processos por nome (`Stop-Process`/`Get-Process | Stop-Process`, `taskkill /IM`, " +
  "`pkill`/`killall`) — isso mata o agent-flow e o seu próprio run, que também rodam em node. " +
  "Se precisar parar um servidor/processo que você mesmo iniciou, guarde o PID ao iniciá-lo e " +
  "mate SOMENTE esse PID (ex.: `Stop-Process -Id <pid>`).\n";

function buildPrompt(run, agentPrompt, { allowGit } = {}) {
  // Agentes git-capazes (ex.: Commit & Push) recebem o contexto das branches e
  // têm liberado o uso de git; os demais são proibidos de tocar em git e devem
  // alterar arquivos via Write/Edit.
  const gitContext = allowGit
    ? "\n\nContexto de git desta worktree:\n" +
      `- Branch de destino do push (branch da worktree): \`${run.target_branch}\`\n` +
      (run.origin_branch
        ? `- Branch de origem/base para diff: \`${run.origin_branch}\`\n`
        : "")
    : "";
  const fileRule = allowGit
    ? "- Rode diretamente os comandos git necessários (status, diff, log, add, commit, push) via Bash.\n"
    : "- Use as ferramentas Write e Edit para criar/modificar arquivos. NÃO descreva — faça.\n";
  const gitRule = allowGit
    ? ""
    : "- NÃO faça commit e NÃO faça push em hipótese " +
      "alguma — apenas altere os arquivos. Versionar as mudanças é responsabilidade " +
      "exclusiva do agente Commit & Push.\n";
  // Pasta de helpers desta worktree: diretório irmão fora da árvore versionada
  // (`<worktree>-helpers`) onde vive o planejamento TLC (.specs/features/...).
  // Como o cwd do agente é a worktree, injetamos o caminho absoluto para que o
  // planner grave e o reviewer/executor leiam sempre no lugar certo — nunca dentro
  // da worktree (onde .specs poluiria a árvore e o scan de TLC não enxerga).
  const helpersContext = run.helpers_dir
    ? "\n\nPasta de helpers desta worktree (FORA da árvore versionada; o cwd é a worktree):\n" +
      `- Caminho absoluto da pasta helpers: \`${run.helpers_dir}\`\n` +
      `- O planejamento TLC vive em \`${run.helpers_dir}/.specs/features/<feature>/\` ` +
      "(spec.md, design.md, tasks.md).\n" +
      "- SEMPRE grave e leia o planejamento nesse caminho absoluto. NUNCA crie `.specs/` " +
      "dentro da worktree.\n"
    : "";
  // Interceptor: agentes não git-capazes têm as palavras commit/push removidas do
  // próprio prompt/skill antes da execução (o Commit & Push é o único isento).
  const effectivePrompt = allowGit ? agentPrompt : stripGitWords(agentPrompt);
  return (
    langInstruction() +
    effectivePrompt +
    gitContext +
    helpersContext +
    "\n\nRegras de execução:\n" +
    fileRule +
    "- Aja SOMENTE com base nas instruções e skills fornecidas acima neste prompt. " +
    "NÃO acione nenhuma outra skill instalada nem inicie fluxos de spec/design/tasks que não tenham sido pedidos.\n" +
    PROCESS_KILL_RULE +
    ASK_RULES +
    "\n" +
    gitRule +
    "TAREFA (card do board):\n" +
    buildCardText(run)
  );
}

async function ensureWorktree(run) {
  if (run.worktree_path) return run;
  const [owner, repo] = run.repo.split("/");
  const { worktreeDir, helpersDir } = await setupWorktree({
    owner,
    repo,
    newBranch: run.target_branch,
    originBranch: run.origin_branch,
    cardNumber: run.card_number,
  });
  return patchRun(run.id, {
    worktree_path: worktreeDir,
    helpers_dir: helpersDir,
  });
}

function isRealChange(line) {
  if (!line.trim()) return false;
  const file = line.slice(3).trim();
  return !file.endsWith(".log") && !file.startsWith(".specs/");
}

// Executa o passo comum pós-claude: erro / ASK / squash+verificação de mudanças / done.
// Sempre chama onSettled ao final, com sucesso ou falha.
async function finishStep(
  run,
  logStream,
  result,
  onSettled,
  { allowGit, skipWorktreeCheck } = {},
) {
  try {
    if (result.code !== 0) {
      logStream.end();
      updateLastExecTurn(run.id, {
        status: "error",
        finishedAt: new Date().toISOString(),
      });
      patchRun(run.id, {
        status: "error",
        last_error: `Execução falhou: ${failureDetail(result, logStream.persistPath)}`,
      });
      return;
    }

    const finalText = extractFinalText(result.output);
    const ask = parseAsk(finalText);
    if (ask) {
      await new Promise((resolve) => logStream.end(resolve));
      updateLastExecTurn(run.id, {
        status: "waiting-input",
        finishedAt: new Date().toISOString(),
      });
      appendTurn(run.id, {
        type: "question",
        text: ask.question,
        options: ask.options ?? [],
      });
      patchRun(run.id, {
        status: "waiting-input",
        pending_question: ask.question,
      });
      return;
    }

    // Dois tipos de agente encerram sem tocar na árvore versionada:
    // - git-capazes (Commit & Push): fazem seus próprios commits/push e deixam a
    //   árvore limpa — squash/exigência de working tree sujo não se aplicam.
    // - de planejamento/review (Feature Planner, Code Reviewer, skipWorktreeCheck):
    //   gravam na pasta helpers, fora da worktree — logo não há mudança a exigir.
    if (allowGit || skipWorktreeCheck) {
      await new Promise((resolve) => logStream.end(resolve));
      updateLastExecTurn(run.id, {
        status: "done",
        finishedAt: new Date().toISOString(),
      });
      if (finalText.trim())
        appendTurn(run.id, { type: "result", text: finalText.trim() });
      patchRun(run.id, { status: "done" });
      return;
    }

    const { stdout: countOut } = await execFileP(
      "git",
      ["rev-list", "--count", `${run._initialHead}..HEAD`],
      { cwd: run.worktree_path, timeout: 5_000 },
    ).catch(() => ({ stdout: "0" }));
    const claudeCommits = parseInt(countOut.trim(), 10) || 0;
    if (run._initialHead && claudeCommits > 0) {
      logStream.write(`\n=== Squashing ${claudeCommits} commit(s) ===\n`);
      await execFileP("git", ["reset", "--soft", `HEAD~${claudeCommits}`], {
        cwd: run.worktree_path,
        timeout: 15_000,
      }).catch((e) => logStream.write(`Warning: reset failed: ${e.message}\n`));
    }

    const { stdout: changesOut } = await execFileP(
      "git",
      ["status", "--porcelain"],
      { cwd: run.worktree_path, timeout: 10_000 },
    ).catch(() => ({ stdout: "" }));
    const realChanges = changesOut.trim().split("\n").filter(isRealChange);

    if (realChanges.length === 0) {
      logStream.end();
      updateLastExecTurn(run.id, {
        status: "error",
        finishedAt: new Date().toISOString(),
      });
      patchRun(run.id, {
        status: "error",
        last_error: `Execução falhou: nenhum arquivo foi alterado\n(log completo: ${logStream.persistPath})`,
      });
      return;
    }

    await new Promise((resolve) => logStream.end(resolve));
    updateLastExecTurn(run.id, {
      status: "done",
      finishedAt: new Date().toISOString(),
    });
    if (finalText.trim())
      appendTurn(run.id, { type: "result", text: finalText.trim() });
    patchRun(run.id, { status: "done" });
  } finally {
    unregisterProcess(run.id);
    onSettled?.();
  }
}

export async function startRun(run, { onSettled } = {}) {
  let agentPrompt;
  try {
    agentPrompt = buildAgentPrompt(run.agent_id);
  } catch (err) {
    patchRun(run.id, { status: "error", last_error: err.message });
    onSettled?.();
    return;
  }

  // allowGit libera o agente a rodar git (add/commit/push) e altera o pós-processamento
  // (sem squash nem exigência de working tree sujo). Ver defaults/commit-push.json.
  const allowGit = !!getAgent(run.agent_id)?.allowGit;
  // skipWorktreeCheck: agentes que gravam fora da worktree (pasta helpers), como
  // Feature Planner e Code Reviewer, não produzem mudanças na árvore versionada —
  // sem essa flag o pós-processamento os marcaria como "nenhum arquivo foi alterado".
  const skipWorktreeCheck = !!getAgent(run.agent_id)?.skipWorktreeCheck;

  try {
    run = await ensureWorktree(run);
  } catch (err) {
    patchRun(run.id, {
      status: "error",
      last_error: `setupWorktree falhou: ${err.message}`,
    });
    onSettled?.();
    return;
  }

  // Cada invocação (execução inicial ou retomada) grava seu PRÓPRIO arquivo de log
  // ("segmento"), registrado como um turn `exec`. Assim o chat mostra o log em
  // camadas: um bloco por execução, e o SSE ao vivo (buffer por run.id) reflete só
  // o segmento atual. `log_file` guarda sempre o segmento corrente.
  const logFile = `seg-${Date.now().toString(36)}.log`;
  run = patchRun(run.id, { log_file: logFile });
  appendTurn(run.id, {
    type: "exec",
    logFile,
    status: "processing",
    startedAt: new Date().toISOString(),
  });

  // resume=1 pode vir de: (a) recovery de crash → prompt "continuar"; ou
  // (b) resposta/mensagem do usuário enfileirada → usa a mensagem como entrada.
  const wasResume = !!run.resume;
  const resumeMessage = run.resume_message?.trim()
    ? run.resume_message.trim()
    : null;
  if (wasResume) run = patchRun(run.id, { resume: 0, resume_message: null });

  const synthWt = {
    id: run.id,
    path: run.worktree_path,
    helpersDir: run.helpers_dir,
  };
  const logStream = createRunLog(synthWt, logFile, { append: false });

  const { stdout: headBefore } = await execFileP("git", ["rev-parse", "HEAD"], {
    cwd: run.worktree_path,
    timeout: 5_000,
  }).catch(() => ({ stdout: "" }));
  run._initialHead = headBefore.trim();

  const opts = { model: run.model, effort: run.effort };
  const onSpawn = (child) => registerProcess(run.id, child);
  let result;
  if (wasResume) {
    if (resumeMessage)
      logStream.write("\n=== Resposta do usuário (resume) ===\n");
    result = await resumeClaude(
      "Lembrete de regras (continuam valendo nesta continuação):\n" +
        PROCESS_KILL_RULE +
        "\n" +
        (resumeMessage ?? "continuar"),
      run.worktree_path,
      logStream,
      run.session_id,
      onSpawn,
      opts,
    );
  } else {
    result = await runClaude(
      buildPrompt(run, agentPrompt, { allowGit }),
      run.worktree_path,
      logStream,
      null,
      onSpawn,
      { ...opts, sessionId: run.session_id },
    );
  }

  await finishStep(run, logStream, result, onSettled, { allowGit, skipWorktreeCheck });
}
