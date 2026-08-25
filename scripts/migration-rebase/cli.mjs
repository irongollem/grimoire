#!/usr/bin/env node
/**
 * migration-rebase — keep migration versions ahead of the branch you will merge
 * into, and rename them forward when they are not.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * A migration filename records when it was *created*; the database enforces the
 * order in which migrations were *merged*. Those are different orders the
 * moment two pieces of work exist at once, and nothing reconciles them. Two
 * failures follow, both of which have reached this project's production:
 *
 *   1. COLLISION. Two files claim one version. `db push` dies on the migration
 *      table's primary key and everything queued behind it is stranded. Hit on
 *      5 Aug 2026 (#602 vs PR #615) and again on 9 Aug 2026.
 *
 *   2. OUT OF ORDER. A migration is authored, something else merges and deploys
 *      first, and by the time it lands its version is in the past. `db push`
 *      refuses it — and because the frontend deploys off the same push through
 *      a different pipeline, the app ships anyway against a schema that never
 *      got the change. Hit on 9 Aug 2026 (#649) and 25 Aug 2026 (#770).
 *
 * The 25 Aug case is the one that shaped this tool: there was no branch and no
 * pull request. Two agents were working in git worktrees, and one held a
 * timestamp for seven hours while the other merged four migrations. Branch
 * protection and merge queues — the standard answers — do nothing there.
 * Parallel agents reproduce the multi-developer merge problem in repos that
 * never open a PR.
 *
 * ── What it knows about your project ────────────────────────────────────────
 *
 * Nothing. It never connects to a database, never parses SQL, and never reads
 * anything but filenames and text. A "version" is whatever the configured
 * pattern captures; the base ref comes from git. Point it at Rails'
 * `db/migrate`, Flyway's `V1_2__x.sql` or Supabase's `supabase/migrations` and
 * it behaves identically.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *   node scripts/migration-rebase/cli.mjs --check     # exit 1 if anything is wrong
 *   node scripts/migration-rebase/cli.mjs --write     # rename forward and fix citations
 *   node scripts/migration-rebase/cli.mjs --write --dry-run
 *
 * Options: --base <ref> (default origin/main), --dir <path>, --pattern <regex>.
 * Optional config at `migration-rebase.json` in the repo root with the same
 * keys. Runs on bare node with no dependencies and no install step, which is
 * what lets it run in CI before setup-node and inside a pre-push hook.
 */
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { planRebase, countVersionCitations, rewriteVersionCitations } from "./core.mjs";
import {
  repoRoot,
  refExists,
  filenamesAtRef,
  filenamesOnDisk,
  renameFile,
  candidateTextFiles,
  readTextFile,
  writeTextFile,
} from "./io.mjs";

/** Layouts probed when no directory is configured, most specific first. */
const KNOWN_LAYOUTS = [
  { dir: "supabase/migrations", pattern: "^(?<version>\\d{14})_.+\\.sql$" },
  { dir: "db/migrate", pattern: "^(?<version>\\d{14})_.+\\.rb$" },
  { dir: "migrations", pattern: "^(?<version>\\d+)[_-].+$" },
  { dir: "prisma/migrations", pattern: "^(?<version>\\d+)_.+$" },
];

function parseArgs(argv) {
  const args = { mode: null, base: null, dir: null, pattern: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check") args.mode = "check";
    else if (arg === "--write") args.mode = "write";
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--base") args.base = argv[++i];
    else if (arg === "--dir") args.dir = argv[++i];
    else if (arg === "--pattern") args.pattern = argv[++i];
    else if (arg === "--help" || arg === "-h") args.mode = "help";
    else {
      console.error(`Unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return args;
}

function loadConfig(root) {
  try {
    return JSON.parse(readFileSync(join(root, "migration-rebase.json"), "utf8"));
  } catch {
    return {};
  }
}

function resolveSettings(args, config, root) {
  let dir = args.dir ?? config.dir ?? null;
  let pattern = args.pattern ?? config.pattern ?? null;
  if (dir === null) {
    const found = KNOWN_LAYOUTS.find((layout) => filenamesOnDisk(layout.dir, root).length > 0);
    if (!found) {
      console.error(
        "No migration directory found. Pass --dir, or add `dir` and `pattern` to " +
          "migration-rebase.json.",
      );
      process.exit(2);
    }
    dir = found.dir;
    pattern ??= found.pattern;
  }
  if (pattern === null) {
    const known = KNOWN_LAYOUTS.find((layout) => layout.dir === dir);
    pattern = known ? known.pattern : "^(?<version>\\d+)[_-].+$";
  }
  return { dir, pattern: new RegExp(pattern), base: args.base ?? config.baseRef ?? "origin/main" };
}

/**
 * Every file citing `version` as a standalone token, with its occurrence count.
 *
 * Nothing is excluded, deliberately. An earlier revision skipped the migrations
 * being renamed, on the theory that a file's own header should not be rewritten
 * — which quietly broke the case that matters most: one migration citing
 * another's version. A migration that says "supersedes 20260825005907" is the
 * single most likely place for that string to appear, and leaving it stale
 * points a reader at a file that no longer exists. A file's own self-reference
 * should be updated too, for exactly the same reason.
 */
function findCitations(version, root) {
  const hits = [];
  for (const path of candidateTextFiles(root)) {
    const text = readTextFile(path, root);
    if (text === null) continue;
    const count = countVersionCitations(text, version);
    if (count > 0) hits.push({ path, count });
  }
  return hits;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === "help" || args.mode === null) {
    console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace(/^.*?\n/, ""));
    process.exit(args.mode === null ? 2 : 0);
  }

  const root = repoRoot();
  const { dir, pattern, base } = resolveSettings(args, loadConfig(root), root);

  // A shallow clone has no base ref. Comparing is impossible; failing the build
  // because a comparison was unavailable would be worse than not comparing.
  const haveBase = refExists(base, root);
  if (!haveBase) {
    console.warn(`warning: ${base} is not available — checking uniqueness and shape only.`);
  }

  const plan = planRebase({
    localFilenames: filenamesOnDisk(dir, root),
    baseFilenames: haveBase ? filenamesAtRef(base, dir, root) : [],
    pattern,
    now: new Date(),
  });

  // Only `--check` reports these as errors. In `--write` they are the work item,
  // and printing "ERROR" immediately before fixing the thing reads as a failure.
  const blocked = plan.malformed.length > 0 || plan.duplicates.length > 0;
  if (args.mode === "check") {
    let failed = false;
    for (const filename of plan.malformed) {
      console.error(`ERROR: ${filename} does not match ${pattern}`);
      failed = true;
    }
    for (const { version, filenames } of plan.duplicates) {
      console.error(`ERROR: version ${version} is claimed by ${filenames.length} files:`);
      for (const filename of filenames) console.error(`         ${filename}`);
      console.error("       Applying these fails on the migration table's primary key.");
      failed = true;
    }
    for (const { filename, version } of plan.offenders) {
      console.error(
        `ERROR: ${filename} (${version}) is at or before the newest on ${base} (${plan.line}).`,
      );
      failed = true;
    }
    if (failed) {
      if (plan.moves.length > 0) {
        console.error("");
        console.error("Fix with: node scripts/migration-rebase/cli.mjs --write");
      }
      process.exit(1);
    }
    console.log(`Migration versions OK: unique, well-formed, and newer than ${base}.`);
    return;
  }

  // ── write ─────────────────────────────────────────────────────────────────
  if (blocked) {
    for (const filename of plan.malformed) console.error(`ERROR: ${filename} does not match ${pattern}`);
    for (const { version, filenames } of plan.duplicates) {
      console.error(`ERROR: version ${version} is claimed by: ${filenames.join(", ")}`);
    }
    console.error("");
    console.error("Refusing to rebase while names are malformed or versions collide:");
    console.error("both need a human decision about which file keeps which version.");
    process.exit(1);
  }
  if (plan.moves.length === 0) {
    console.log(`Nothing to rebase: every local migration already lands after ${base}.`);
    return;
  }

  // Citations are collected for every move up front, while all files are still
  // at their original paths, then rewritten, and only then are files renamed.
  //
  // The order is load-bearing. Renaming first invalidates the paths just
  // collected, so a migration's own body would silently miss its rewrite —
  // `readTextFile` returns null for a path that no longer exists, and a skipped
  // rewrite looks identical to a file with nothing to rewrite.
  const planned = plan.moves.map((move) => ({ move, citations: findCitations(move.oldVersion, root) }));

  for (const { move, citations } of planned) {
    console.log(`${move.from}\n  -> ${move.to}`);
    for (const { path, count } of citations) {
      console.log(`     cites ${move.oldVersion} x${count}: ${path}`);
    }
  }
  if (args.dryRun) {
    console.log("");
    console.log(`Dry run: ${plan.moves.length} migration(s) would move past ${plan.line}.`);
    return;
  }

  for (const { move, citations } of planned) {
    // Re-read per rewrite: one file may cite several of the versions moving in
    // this run, and each pass must build on the last.
    for (const { path } of citations) {
      const text = readTextFile(path, root);
      if (text === null) continue;
      writeTextFile(path, rewriteVersionCitations(text, move.oldVersion, move.newVersion), root);
    }
  }
  for (const { move } of planned) renameFile(dir, move.from, move.to, root);
  console.log("");
  console.log(
    `Rebased ${plan.moves.length} migration(s) past ${plan.line}. Review the diff before committing.`,
  );
}

main();
