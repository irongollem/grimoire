/**
 * Every side effect the rebaser has: git plumbing and file reads/writes.
 * Deliberately thin, and deliberately the only file that knows a disk exists —
 * `core.mjs` stays pure so the interesting logic is testable without a repo.
 *
 * Uses git rather than the filesystem wherever it can. `git ls-tree` answers
 * "what does the base branch look like" without checking anything out, which is
 * what lets this run inside a worktree, mid-edit, with a dirty tree.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync, statSync, renameSync } from "node:fs";
import { join, basename } from "node:path";

/**
 * @param {string[]} args
 * @param {string} [cwd]
 * @returns {string}
 */
function git(args, cwd, { quiet = false } = {}) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    // Probes below use git's exit code as the answer, so its diagnostic on
    // stderr is noise the caller has already handled. Without this, asking
    // "is this file tracked?" prints "did not match any file(s)" for every
    // freshly created migration — which is the normal case, and reads as a
    // failure in the middle of a successful run.
    stdio: quiet ? ["ignore", "pipe", "ignore"] : ["ignore", "pipe", "pipe"],
  });
}

/** Absolute path of the repository root, so the tool works from any subdirectory. */
export function repoRoot() {
  return git(["rev-parse", "--show-toplevel"]).trim();
}

/** True when `ref` exists — false in a shallow clone, which must not be fatal. */
export function refExists(ref, cwd) {
  try {
    git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], cwd, { quiet: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Filenames in `dir` as of `ref`. Empty when the ref or directory is absent.
 * @returns {string[]}
 */
export function filenamesAtRef(ref, dir, cwd) {
  try {
    return git(["ls-tree", "-r", "--name-only", ref, "--", dir], cwd, { quiet: true })
      .split("\n")
      .filter(Boolean)
      .map((p) => basename(p));
  } catch {
    return [];
  }
}

/** Filenames currently in `dir` on disk — the working tree, including uncommitted files. */
export function filenamesOnDisk(dir, cwd) {
  try {
    return readdirSync(join(cwd, dir), { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/** Whether git is tracking `path` — false for a file that exists only on disk. */
export function isTracked(path, cwd) {
  try {
    git(["ls-files", "--error-unmatch", "--", path], cwd, { quiet: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Renames a migration, through git when it can.
 *
 * `git mv` is preferred because it records a rename rather than a delete plus
 * an add, which keeps `git log --follow` and the review diff readable. But it
 * refuses a file it does not track — and an untracked file is the *common*
 * case here, because the migration you just generated has not been committed
 * yet. Falling back to a plain rename is not a degradation; it is the path most
 * runs take.
 */
export function renameFile(dir, from, to, cwd) {
  const source = join(dir, from);
  const destination = join(dir, to);
  if (isTracked(source, cwd)) git(["mv", source, destination], cwd);
  else renameSync(join(cwd, source), join(cwd, destination));
}

/**
 * Every text file git knows about, tracked or newly added but not ignored.
 *
 * Asking git rather than walking the tree means `.gitignore` is honoured for
 * free — no hand-maintained list of `node_modules`, `dist`, build output or
 * whatever the host project happens to generate. That is most of what keeps
 * this tool ignorant of the codebase it is pointed at.
 * @returns {string[]} repo-relative paths
 */
export function candidateTextFiles(cwd) {
  const tracked = git(["ls-files", "-z"], cwd).split("\0").filter(Boolean);
  const untracked = git(["ls-files", "-z", "--others", "--exclude-standard"], cwd)
    .split("\0")
    .filter(Boolean);
  return [...new Set([...tracked, ...untracked])];
}

/** Two megabytes: past this a file is a fixture or a blob, not prose citing a version. */
const MAX_SCAN_BYTES = 2 * 1024 * 1024;

/**
 * File contents, or null when it should not be scanned — too large, unreadable,
 * or binary. Binary is detected by a NUL byte rather than by extension, so the
 * tool needs no list of the host project's file types.
 * @returns {string | null}
 */
export function readTextFile(path, cwd) {
  const full = join(cwd, path);
  try {
    if (statSync(full).size > MAX_SCAN_BYTES) return null;
    const text = readFileSync(full, "utf8");
    return text.includes("\0") ? null : text;
  } catch {
    return null;
  }
}

export function writeTextFile(path, text, cwd) {
  writeFileSync(join(cwd, path), text, "utf8");
}
