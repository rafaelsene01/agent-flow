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

  // Fetch to pick up the branch just created via GitHub API
  await git(repoDir, ["fetch", "origin"]);

  // Remove stale worktree if path already exists
  if (fs.existsSync(worktreeDir)) {
    await execFileP("git", ["worktree", "remove", "--force", worktreeDir], {
      cwd: repoDir,
      timeout: 10_000,
    }).catch(() => {});
    fs.rmSync(worktreeDir, { recursive: true, force: true });
  }

  // Checkout strategy:
  // 1. branch exists locally            → worktree add <path> <branch>
  // 2. branch exists on remote          → worktree add --track -b <branch> <path> origin/<branch>
  // 3. branch doesn't exist anywhere    → worktree add -b <branch> <path> origin/<originBranch>
  if (await refExists(repoDir, newBranch)) {
    await git(repoDir, ["worktree", "add", worktreeDir, newBranch]);
  } else if (await refExists(repoDir, `origin/${newBranch}`)) {
    await git(repoDir, ["worktree", "add", "--track", "-b", newBranch, worktreeDir, `origin/${newBranch}`]);
  } else {
    const base = (await refExists(repoDir, `origin/${originBranch}`))
      ? `origin/${originBranch}`
      : originBranch;
    await git(repoDir, ["worktree", "add", "-b", newBranch, worktreeDir, base]);
  }

  registerWorktree({ owner, repo, branch: newBranch, cardNumber, repoDir, worktreeDir });

  return { repoDir, worktreeDir, cloned };
}
