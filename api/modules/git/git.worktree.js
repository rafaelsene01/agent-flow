import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { getConfig, registerWorktree } from "../config/config.service.js";
import { getToken } from "../github/github.client.js";

const execFileP = promisify(execFile);

async function git(cwd, args) {
  const { stdout } = await execFileP("git", args, { cwd, timeout: 60_000 });
  return stdout.trim();
}

async function refExists(cwd, ref) {
  try {
    await execFileP("git", ["rev-parse", "--verify", ref], { cwd, timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

// Scan projectsPath for any git repo whose origin remote matches owner/repo.
// Returns the directory path if found, null otherwise.
async function findExistingClone(projectsPath, owner, repo) {
  let entries;
  try {
    entries = fs.readdirSync(projectsPath, { withFileTypes: true });
  } catch {
    return null;
  }
  const needle = `${owner}/${repo}`;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(projectsPath, entry.name);
    if (!fs.existsSync(path.join(dir, ".git"))) continue;
    try {
      const { stdout } = await execFileP(
        "git", ["remote", "get-url", "origin"],
        { cwd: dir, timeout: 5_000 },
      );
      if (stdout.trim().replace(/\.git$/, "").includes(needle)) return dir;
    } catch { /* not a git repo or no remote */ }
  }
  return null;
}

export async function setupWorktree({ owner, repo, newBranch, originBranch, cardNumber }) {
  const { projectsPath } = getConfig();
  const worktreeDir = path.join(projectsPath, `${repo}-${cardNumber}`);
  let cloned = false;

  // Prefer an existing clone anywhere in projectsPath over cloning anew
  let repoDir = await findExistingClone(projectsPath, owner, repo);

  if (!repoDir) {
    repoDir = path.join(projectsPath, repo);
    const token    = getToken();
    const cloneUrl = token
      ? `https://x-access-token:${token}@github.com/${owner}/${repo}.git`
      : `https://github.com/${owner}/${repo}.git`;
    fs.mkdirSync(projectsPath, { recursive: true });
    await execFileP("git", ["clone", cloneUrl, repoDir], { timeout: 300_000 });
    cloned = true;
  }

  // Fetch + pull origin branch before creating the new one.
  // fetch --all updates all remote refs; then we fast-forward the originBranch
  // locally so the new branch starts from the latest remote state.
  // Using --ff-only so we never create a merge commit or fail on diverged history.
  await git(repoDir, ["fetch", "--all"]);
  await execFileP(
    "git", ["pull", "--ff-only", "origin", originBranch],
    { cwd: repoDir, timeout: 60_000 },
  ).catch(() => {
    // Not fatal: branch may be diverged, detached HEAD, or not yet exist locally.
    // The worktree will still be created from origin/{originBranch}.
  });

  // Clean up: remove directory if present, then prune stale git registrations.
  if (fs.existsSync(worktreeDir)) {
    await execFileP("git", ["worktree", "remove", "--force", worktreeDir], {
      cwd: repoDir, timeout: 10_000,
    }).catch(() => {});
    fs.rmSync(worktreeDir, { recursive: true, force: true });
  }
  // Prune removes registrations whose paths no longer exist on disk
  // (covers the "missing but already registered" error).
  await execFileP("git", ["worktree", "prune"], { cwd: repoDir, timeout: 10_000 }).catch(() => {});

  // Checkout strategy:
  // 1. branch exists locally   → worktree add <path> <branch>
  // 2. branch exists on remote → worktree add --track -b <branch> <path> origin/<branch>
  // 3. branch doesn't exist    → worktree add -b <branch> <path> origin/<originBranch>
  async function addWorktree(extraArgs, ref) {
    try {
      await git(repoDir, ["worktree", "add", ...extraArgs, worktreeDir, ref]);
    } catch (err) {
      // Last-resort: if git still considers the path registered, force it.
      if (err.message?.includes("already registered")) {
        await git(repoDir, ["worktree", "add", "-f", ...extraArgs, worktreeDir, ref]);
      } else {
        throw err;
      }
    }
  }

  if (await refExists(repoDir, newBranch)) {
    await addWorktree([], newBranch);
  } else if (await refExists(repoDir, `origin/${newBranch}`)) {
    await addWorktree(["--track", "-b", newBranch], `origin/${newBranch}`);
  } else {
    const base = (await refExists(repoDir, `origin/${originBranch}`))
      ? `origin/${originBranch}`
      : originBranch;
    await addWorktree(["-b", newBranch], base);
  }

  // Safety: if worktree ended up on the origin branch instead of the feature branch,
  // create and checkout the feature branch now so commits/pushes go to the right place.
  const currentBranch = await git(worktreeDir, ["branch", "--show-current"]);
  if (currentBranch === originBranch) {
    await git(worktreeDir, ["checkout", "-b", newBranch]);
  }

  // Write per-worktree excludes (not committed) so internal files never appear as changed
  try {
    const { stdout: gitDirRaw } = await execFileP(
      "git", ["rev-parse", "--git-dir"],
      { cwd: worktreeDir, timeout: 5_000 },
    );
    const infoDir = path.join(gitDirRaw.trim(), "info");
    const excludeFile = path.join(infoDir, "exclude");
    fs.mkdirSync(infoDir, { recursive: true });
    const existing = fs.existsSync(excludeFile) ? fs.readFileSync(excludeFile, "utf8") : "";
    const entries = [".gitkeep", "CARD.md", "agent-flow.log", "tlc.log", "tlc-exec.log", ".specs/"];
    const toAdd = entries.filter((e) => !existing.includes(e));
    if (toAdd.length) fs.appendFileSync(excludeFile, "\n" + toAdd.join("\n") + "\n");
  } catch (_) {}

  registerWorktree({ owner, repo, branch: newBranch, cardNumber, repoDir, worktreeDir });

  return { repoDir, worktreeDir, cloned };
}
