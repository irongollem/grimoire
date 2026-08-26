import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * Integration cover for the parts `core.test.mjs` cannot reach: git, the
 * filesystem, and the order in which the CLI touches them.
 *
 * Every case here is a bug this tool actually shipped with and that unit tests
 * could not have caught — `git mv` refusing untracked files, and citations
 * being collected relative to paths that the rename had already invalidated.
 * They were found by driving the real CLI against a real repository, so that is
 * what this does.
 */
// Resolved from the project root rather than `import.meta.url`: Vitest serves
// modules over http, so `import.meta.url` here is not a file:// URL and
// `fileURLToPath` rejects it.
const CLI = resolve(process.cwd(), "scripts/migration-rebase/cli.mjs");
if (!existsSync(CLI)) throw new Error(`CLI not found at ${CLI}`);
const created = [];

afterEach(() => {
  while (created.length) rmSync(created.pop(), { recursive: true, force: true });
});

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

function run(cwd, ...args) {
  try {
    return { code: 0, out: execFileSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" }) };
  } catch (error) {
    return { code: error.status ?? 1, out: `${error.stdout ?? ""}${error.stderr ?? ""}` };
  }
}

/**
 * A repo whose base ref already holds `base` migrations, with `local` present
 * only in the working tree — the shape of every out-of-order incident.
 */
function makeRepo({ base, local, files = {} }) {
  const root = mkdtempSync(join(tmpdir(), "migration-rebase-"));
  created.push(root);
  mkdirSync(join(root, "supabase/migrations"), { recursive: true });
  git(["init", "-q"], root);
  git(["config", "user.email", "t@t.invalid"], root);
  git(["config", "user.name", "T"], root);
  for (const [name, body] of Object.entries(base)) {
    writeFileSync(join(root, "supabase/migrations", name), body);
  }
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(root, path, ".."), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  git(["add", "-A"], root);
  git(["commit", "-qm", "base"], root);
  git(["branch", "-qM", "main"], root);
  git(["update-ref", "refs/remotes/origin/main", "main"], root);
  // Written after the commit, so these are untracked — which is what a
  // just-generated migration always is, and what `git mv` refuses to move.
  for (const [name, body] of Object.entries(local)) {
    writeFileSync(join(root, "supabase/migrations", name), body);
  }
  return root;
}

const BASE = {
  "20260825000600_luna.sql": "-- luna\n",
  "20260825073922_poller.sql": "-- poller\n",
};

describe("migration-rebase CLI", () => {
  it("passes when every local migration already lands after the base ref", () => {
    const root = makeRepo({ base: BASE, local: { "20260826010000_fine.sql": "-- fine\n" } });
    const { code, out } = run(root, "--check");
    expect(code).toBe(0);
    expect(out).toMatch(/Migration versions OK/);
  });

  it("fails, and names the offender, when one is dated before the base ref", () => {
    const root = makeRepo({ base: BASE, local: { "20260825005907_stale.sql": "-- stale\n" } });
    const { code, out } = run(root, "--check");
    expect(code).toBe(1);
    expect(out).toMatch(/20260825005907_stale\.sql/);
    expect(out).toMatch(/20260825073922/);
  });

  // Bug 1: `git mv` refuses a file it does not track, and an uncommitted
  // migration is the normal case rather than an edge one.
  it("renames a migration that git does not track yet", () => {
    const root = makeRepo({ base: BASE, local: { "20260825005907_stale.sql": "-- stale\n" } });
    expect(run(root, "--write").code).toBe(0);
    const names = readdirSync(join(root, "supabase/migrations"));
    expect(names).not.toContain("20260825005907_stale.sql");
    expect(names.some((n) => /^\d{14}_stale\.sql$/.test(n) && n > "20260825073922")).toBe(true);
    expect(run(root, "--check").code).toBe(0);
  });

  // Bug 2: citations were collected against paths the rename had already
  // invalidated, so a migration's own body silently missed its rewrite.
  it("rewrites the renamed migration's own self-citation", () => {
    const root = makeRepo({
      base: BASE,
      local: { "20260825005907_stale.sql": "-- Migration: 20260825005907\n" },
    });
    run(root, "--write");
    const dir = join(root, "supabase/migrations");
    const renamed = readdirSync(dir).find((n) => n.endsWith("_stale.sql"));
    const version = renamed.slice(0, 14);
    expect(readFileSync(join(dir, renamed), "utf8")).toContain(version);
    expect(readFileSync(join(dir, renamed), "utf8")).not.toContain("20260825005907");
  });

  // Bug 3: one migration citing another's version is the likeliest place for
  // the string to appear, and it was the case being skipped.
  it("rewrites a citation in a sibling migration and in prose", () => {
    const root = makeRepo({
      base: BASE,
      local: {
        "20260825005907_early.sql": "-- early\n",
        "20260825080000_later.sql": "-- builds on 20260825005907\n",
      },
      files: { "docs/notes.md": "poller: 20260825073922\n" },
    });
    writeFileSync(join(root, "docs/notes.md"), "early is 20260825005907, not 120260825005907\n");
    run(root, "--write");
    const dir = join(root, "supabase/migrations");
    const early = readdirSync(dir).find((n) => n.endsWith("_early.sql"));
    const later = readdirSync(dir).find((n) => n.endsWith("_later.sql"));
    const newEarly = early.slice(0, 14);

    expect(readFileSync(join(dir, later), "utf8")).toContain(newEarly);
    const notes = readFileSync(join(root, "docs/notes.md"), "utf8");
    expect(notes).toContain(newEarly);
    // The digit-boundary guard: a longer number that merely contains the
    // version must survive untouched.
    expect(notes).toContain("120260825005907");
    // Relative order survives, because a later migration may depend on an
    // earlier one.
    expect(newEarly < later.slice(0, 14)).toBe(true);
  });

  it("never renames a migration that exists on the base ref", () => {
    const root = makeRepo({ base: BASE, local: { "20260825005907_stale.sql": "-- stale\n" } });
    run(root, "--write");
    const names = readdirSync(join(root, "supabase/migrations"));
    expect(names).toContain("20260825000600_luna.sql");
    expect(names).toContain("20260825073922_poller.sql");
  });

  it("reports a version collision and refuses to guess which file should move", () => {
    const root = makeRepo({
      base: BASE,
      local: { "20260826010000_a.sql": "-- a\n", "20260826010000_b.sql": "-- b\n" },
    });
    expect(run(root, "--check").code).toBe(1);
    const write = run(root, "--write");
    expect(write.code).toBe(1);
    expect(write.out).toMatch(/collide|claimed by/i);
  });

  // A value-less option flag used to resolve back to the default, so this run
  // reported "newer than origin/main" while the operator believed otherwise.
  it("refuses an option flag with no value instead of falling back to the default", () => {
    const root = makeRepo({ base: BASE, local: {} });
    const { code, out } = run(root, "--check", "--base");
    expect(code).toBe(2);
    expect(out).toMatch(/--base needs a value/);
  });

  // A stray dotfile must not block the push hook or disable --write.
  it("ignores a stray file in the migrations directory", () => {
    const root = makeRepo({ base: BASE, local: { "20260825005907_stale.sql": "-- stale\n" } });
    writeFileSync(join(root, "supabase/migrations/.DS_Store"), "\0junk");
    expect(run(root, "--write").code).toBe(0);
    expect(run(root, "--check").code).toBe(0);
  });

  it("changes nothing on a dry run", () => {
    const root = makeRepo({ base: BASE, local: { "20260825005907_stale.sql": "-- stale\n" } });
    const { code, out } = run(root, "--write", "--dry-run");
    expect(code).toBe(0);
    expect(out).toMatch(/Dry run/);
    expect(readdirSync(join(root, "supabase/migrations"))).toContain("20260825005907_stale.sql");
  });
});
