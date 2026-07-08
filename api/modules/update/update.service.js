import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { PACKAGE_ROOT } from "../../paths.js";
import { getActiveCount } from "../claude/claude.concurrency.js";

const execFileP = promisify(execFile);

// Flag observada pelo supervisor do daemon (scripts/daemon/daemon.*): quando
// existe, ele faz git pull + build e reinicia o servidor. O servidor nunca se
// atualiza sozinho — só grava a flag quando o usuário autoriza na UI.
const FLAG_PATH = path.join(os.homedir(), ".agent-flow", "update-requested");

// git fetch é caro/rede — o resultado fica em cache e a UI pode pollar à vontade.
const FETCH_TTL_MS = 10 * 60 * 1000;
let cachedLatest = null;
let lastFetch = 0;

// Lida uma única vez por processo: `current` é a versão do servidor em
// execução, não a dos arquivos no disco. Durante o update o git pull troca o
// package.json antes do restart — reler do disco faria a UI recarregar cedo
// demais, com o dist/ ainda sendo reconstruído (página 404).
let currentVersion = null;

function localVersion() {
  currentVersion ??= JSON.parse(
    fs.readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf-8"),
  ).version;
  return currentVersion;
}

async function git(...args) {
  const { stdout } = await execFileP("git", args, {
    cwd: PACKAGE_ROOT,
    timeout: 30_000,
  });
  return stdout.trim();
}

async function remoteVersion() {
  await git("fetch", "--quiet", "origin");
  const upstream = await git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}");
  return JSON.parse(await git("show", `${upstream}:package.json`)).version;
}

export async function getUpdateInfo({ refresh = false } = {}) {
  const current = localVersion();
  const info = {
    current,
    latest: current,
    updateAvailable: false,
    activeRuns: getActiveCount(),
    updateRequested: fs.existsSync(FLAG_PATH),
  };
  // Instalação sem clone git (ex.: npm i -g) não tem como se atualizar.
  if (!fs.existsSync(path.join(PACKAGE_ROOT, ".git"))) return info;

  if (refresh || cachedLatest === null || Date.now() - lastFetch > FETCH_TTL_MS) {
    try {
      cachedLatest = await remoteVersion();
      lastFetch = Date.now();
    } catch {
      // Sem rede/upstream: reporta como sem atualização.
      return info;
    }
  }
  info.latest = cachedLatest;
  info.updateAvailable = cachedLatest !== current;
  return info;
}

export async function requestUpdate() {
  const info = await getUpdateInfo({ refresh: true });
  if (!info.updateAvailable) {
    const err = new Error("Nenhuma atualização disponível.");
    err.statusCode = 409;
    throw err;
  }
  fs.mkdirSync(path.dirname(FLAG_PATH), { recursive: true });
  fs.writeFileSync(FLAG_PATH, info.latest, "utf-8");
  return { ...info, updateRequested: true };
}
