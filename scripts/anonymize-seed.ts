#!/usr/bin/env tsx
/**
 * Scramble real email addresses out of `supabase/seed.sql` (#652).
 *
 * `npm run db:pull` dumps production `auth` + `public` data so local dev has
 * realistic content. The volume and the shape are the reason to pull it; the
 * identities are not. Left alone, the dump puts real addresses on every
 * developer machine indefinitely — outside every control that applies to
 * production: no retention period, and out of reach of account erasure, which
 * cannot follow a user into a file on somebody's laptop. See
 * `context/compliance/data-subject-rights.md` §5.
 *
 * Every address becomes `user-<n>@example.invalid` — RFC 2606 reserves the
 * `.invalid` TLD precisely so it can never resolve, so a stray local send has
 * nowhere to go. One address survives: the one you sign in with, so the seeded
 * account is still yours to log into. That is `git config user.email` unless
 * `SEED_KEEP_EMAILS` (comma-separated) says otherwise.
 *
 * One address maps to one placeholder across the whole file, so
 * `auth.users.email`, the copies inside `auth.identities.identity_data` and
 * `raw_user_meta_data`, and the `campaign_members.display_name` /
 * `party_members.player_name` rows that still hold an address (#636) all go on
 * agreeing with each other — and the unique index on `auth.users.email` still
 * holds, because distinct inputs get distinct placeholders.
 *
 * Usage:
 *   npm run db:pull                  # dump, then anonymize
 *   npm run db:anonymize             # anonymize an existing seed.sql in place
 *   npm run db:anonymize -- --check  # exit 1 if any real address survives
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const DEFAULT_SEED_PATH = "supabase/seed.sql";
const PLACEHOLDER_DOMAIN = "example.invalid";

/**
 * Deliberately greedy: an address anywhere in the dump gets scrambled, not just
 * in the four tables that hold one today (`auth.users`, `auth.identities`,
 * `campaign_members`, `party_members`). A real address that turns up in a note
 * body or an NPC backstory tomorrow is the same problem, and a table list would
 * quietly stop covering it.
 */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}/g;

/**
 * `logo@2x.png` matches the pattern above. Guard the suffixes that appear as
 * filenames rather than loosening the pattern — a looser pattern starts letting
 * real addresses through, which is the failure that actually costs something.
 */
const FILE_SUFFIXES = new Set([
  "avif", "css", "gif", "html", "jpeg", "jpg", "js", "json", "mp3", "mp4",
  "ogg", "pdf", "png", "svg", "ts", "wav", "webm", "webp",
]);

export interface AnonymizeResult {
  /** The rewritten SQL. Identical to the input when `replaced` is 0. */
  sql: string;
  /** Distinct real addresses that were replaced. */
  replaced: number;
  /** Total occurrences rewritten (one address usually appears several times). */
  occurrences: number;
  /** Keep-listed addresses actually found in the file, lowercased. */
  kept: string[];
}

/**
 * Replace every email address in `sql` except those in `keepEmails`.
 *
 * Idempotent: addresses already at `@example.invalid` are left exactly as they
 * are, so a second run cannot renumber what the first run assigned.
 */
export function anonymizeSeed(sql: string, keepEmails: Iterable<string>): AnonymizeResult {
  const keep = new Set(
    [...keepEmails].map((email) => email.trim().toLowerCase()).filter((email) => email.length > 0),
  );
  const assigned = new Map<string, string>();
  const keptSeen = new Set<string>();
  let occurrences = 0;

  const out = sql.replace(EMAIL_RE, (match) => {
    const lower = match.toLowerCase();

    if (FILE_SUFFIXES.has(lower.slice(lower.lastIndexOf(".") + 1))) return match;
    if (lower.endsWith(`@${PLACEHOLDER_DOMAIN}`)) return match;
    if (keep.has(lower)) {
      keptSeen.add(lower);
      return match;
    }

    let placeholder = assigned.get(lower);
    if (placeholder === undefined) {
      placeholder = `user-${assigned.size + 1}@${PLACEHOLDER_DOMAIN}`;
      assigned.set(lower, placeholder);
    }
    occurrences += 1;
    return placeholder;
  });

  return { sql: out, replaced: assigned.size, occurrences, kept: [...keptSeen] };
}

/**
 * The address to preserve. Defaults to the git identity because that is, by
 * construction, the address of the person running the pull — no hard-coded
 * maintainer address in a public repo, and no setup step for a new contributor.
 */
export function resolveKeepList(env: NodeJS.ProcessEnv = process.env): string[] {
  const configured = env.SEED_KEEP_EMAILS?.trim();
  if (configured) return configured.split(",");
  try {
    return [execFileSync("git", ["config", "user.email"], { encoding: "utf8" }).trim()];
  } catch {
    return [];
  }
}

function main(): number {
  const { values, positionals } = parseArgs({
    options: { check: { type: "boolean", default: false } },
    allowPositionals: true,
  });
  const path = positionals[0] ?? DEFAULT_SEED_PATH;

  // A machine that has never pulled has nothing to leak, and `db:reset` runs
  // --check there too. Absence is a pass, not a failure.
  if (!existsSync(path)) {
    console.log(`${path}: not present — nothing to anonymize.`);
    return 0;
  }

  const result = anonymizeSeed(readFileSync(path, "utf8"), resolveKeepList());

  if (values.check) {
    if (result.replaced === 0) {
      console.log(`${path}: clean — no real email addresses.`);
      return 0;
    }
    console.error(
      `${path}: ${result.replaced} real email address(es) in ${result.occurrences} place(s).\n` +
        `Run \`npm run db:anonymize\` before seeding. A dump taken by hand skips ` +
        `the anonymizer that \`npm run db:pull\` chains onto it.`,
    );
    return 1;
  }

  if (result.replaced > 0) writeFileSync(path, result.sql);
  console.log(
    `${path}: scrambled ${result.replaced} address(es) across ${result.occurrences} occurrence(s).`,
  );
  console.log(
    result.kept.length > 0
      ? `Kept ${result.kept.join(", ")} — you can still sign in locally.`
      : `Kept none — set SEED_KEEP_EMAILS to your own address to keep signing in locally.`,
  );
  return 0;
}

// CLI-entry guard so tests can import without triggering main().
const invokedAsCli =
  typeof process.argv[1] === "string" &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedAsCli) {
  try {
    process.exit(main());
  } catch (err: unknown) {
    console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(2);
  }
}
