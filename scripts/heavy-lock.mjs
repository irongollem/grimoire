#!/usr/bin/env node
/**
 * One heavy job at a time on this machine, across every checkout and every session.
 *
 *   node scripts/heavy-lock.mjs <label> -- <command> [args...]
 *   npm run heavy -- <command> [args...]
 *
 * Several Claude sessions share one laptop, each in its own checkout or worktree. Each one alone can run the full
 * test suite, a typecheck, a build or a Docker-backed database job; together they ran VS Code to 1.7 TB (8 Nov 2026)
 * and about 4 TB (26 Nov 2026) and crashed it, with Docker the biggest single hog. A note in one session's memory
 * cannot stop another session, so the heavy npm scripts run through this lock instead: a directory under the user's
 * home that every checkout shares. Whoever holds it runs; everyone else waits and says who they are waiting for.
 *
 * - Atomic: `mkdir` either creates the lock or fails because it exists; there is no check-then-write race.
 * - Re-entrant: a job that holds the lock passes `GRIMOIRE_HEAVY_LOCK=held` to its children, so `build` running
 *   `typecheck` inside it does not wait on itself.
 * - Stale-safe: a lock whose owner process is gone (a crash, a killed terminal) is taken over, not waited on forever.
 * - Off in CI (`CI` is set there: one job per machine) and by hand with `GRIMOIRE_HEAVY_LOCK=off`.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const LOCK_DIR = join(homedir(), ".cache", "grimoire-heavy-lock");
const OWNER_FILE = "owner.json";

/** Whether a process with this id is still running. */
export function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: it exists but belongs to someone else, so it is alive.
    return error.code === "EPERM";
  }
}

/** The lock's owner as written, or null when there is no lock or it is half-written. */
export function readOwner(dir = LOCK_DIR) {
  try {
    return JSON.parse(readFileSync(join(dir, OWNER_FILE), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Take the lock for `owner` ({ pid, label, cwd, command, startedAt }). Returns null when taken, or the current owner
 * when someone else holds it. A lock whose owner is dead, or that has no owner file a minute after it was made (a
 * holder killed between mkdir and write), is removed and taken.
 */
export function tryAcquire(owner, dir = LOCK_DIR, now = Date.now()) {
  mkdirSync(join(dir, ".."), { recursive: true });
  try {
    mkdirSync(dir);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    const held = readOwner(dir);
    const stale = held === null ? lockAge(dir, now) > 60_000 : !isAlive(held.pid);
    if (!stale) return held ?? { pid: 0, label: "another job", cwd: "?", command: "", startedAt: new Date(now).toISOString() };
    // Two waiters can both find the same dead owner. Remove the lock only if it is still that owner's: one that another
    // waiter has already taken over (a live pid, or a different one) is left alone and waited on.
    const again = readOwner(dir);
    if (again !== null && (held === null || again.pid !== held.pid)) return again;
    rmSync(dir, { recursive: true, force: true });
    return tryAcquire(owner, dir, now);
  }
  writeFileSync(join(dir, OWNER_FILE), JSON.stringify(owner, null, 2));
  return null;
}

/** How long ago the lock directory was made (its mtime), or Infinity when it cannot be read. */
function lockAge(dir, now) {
  try {
    return now - statSync(dir).mtimeMs;
  } catch {
    return Infinity;
  }
}

/** Let the lock go, but only if this process still holds it (a takeover may have replaced it). */
export function release(pid, dir = LOCK_DIR) {
  const held = readOwner(dir);
  if (held !== null && held.pid === pid) rmSync(dir, { recursive: true, force: true });
}

/** One argument as a single POSIX shell word. */
export function shellQuote(arg) {
  return /^[A-Za-z0-9_./:=@%+-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

function describe(owner) {
  const since = new Date(owner.startedAt).toLocaleTimeString();
  return `"${owner.label}" (pid ${owner.pid}, since ${since}) in ${owner.cwd}`;
}

async function main(argv) {
  const split = argv.indexOf("--");
  const label = split > 0 ? argv.slice(0, split).join(" ") : "heavy job";
  const command = split >= 0 ? argv.slice(split + 1) : argv;
  if (command.length === 0) {
    console.error("usage: heavy-lock.mjs <label> -- <command> [args...]");
    process.exit(2);
  }

  const bypass = process.env.CI !== undefined || process.env.GRIMOIRE_HEAVY_LOCK === "off" || process.env.GRIMOIRE_HEAVY_LOCK === "held";
  if (!bypass) {
    const me = { pid: process.pid, label, cwd: process.cwd(), command: command.join(" "), startedAt: new Date().toISOString() };
    let lastSaid = 0;
    for (;;) {
      const holder = tryAcquire(me);
      if (holder === null) break;
      if (Date.now() - lastSaid > 60_000) {
        console.error(`[heavy-lock] waiting: ${describe(holder)} is running. One heavy job at a time on this machine.`);
        lastSaid = Date.now();
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    const letGo = () => release(process.pid);
    process.on("exit", letGo);
  }

  // The first argument is a whole command line (package.json passes it quoted, with && and env prefixes) and goes to the
  // shell as written; arguments npm appends after it (`npm test -- -t "adds a species"`) are quoted so the shell does
  // not split them again.
  const line = [command[0], ...command.slice(1).map(shellQuote)].join(" ");
  const child = spawn(line, {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, GRIMOIRE_HEAVY_LOCK: bypass ? process.env.GRIMOIRE_HEAVY_LOCK : "held" },
  });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => child.kill(signal));
  }
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
