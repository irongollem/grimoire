/**
 * Pure logic for rebasing versioned migration filenames. No filesystem, no git,
 * no database, no knowledge of SQL or of the host project's language — every
 * input arrives as a plain value and every output is a plan someone else
 * executes. That is what makes this half testable, and what would make it
 * liftable into a standalone package unchanged.
 *
 * ── The problem, in one sentence ─────────────────────────────────────────────
 *
 * A migration filename records when it was *created*, but the database enforces
 * the order in which migrations were *merged*. On any workflow where two pieces
 * of work exist at once — branches, or several agents in git worktrees — those
 * two orders drift apart, and the drift is invisible until a deploy fails.
 *
 * Nothing here knows about Postgres. A "version" is a sortable token at the
 * front of a filename; a "migration" is a file whose name matches a pattern the
 * caller supplies. The same logic rebases Rails' `db/migrate`, Flyway's
 * `V1_2__x.sql`, or anything else with an ordered file sequence.
 */

/**
 * A version rendered from a UTC instant. Deliberately takes a Date rather than
 * reading the clock, so the caller owns time and tests are deterministic.
 * @param {Date} date
 * @returns {string}
 */
export function versionFromDate(date) {
  const pad = (n, width = 2) => String(n).padStart(width, "0");
  return (
    pad(date.getUTCFullYear(), 4) +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds())
  );
}

/**
 * The instant a version denotes, or null when it does not denote one.
 *
 * Null is a real case, not a defect: version schemes that predate timestamps
 * are often the same width and still sort correctly — this repo's own history
 * begins with `YYYYMMDD` + a six-digit counter, so `20260426000099` is a
 * perfectly valid version and an impossible time (second 99). Callers must
 * handle null rather than assume every version is a date.
 * @param {string} version
 * @returns {Date | null}
 */
export function dateFromVersion(version) {
  if (!/^\d{14}$/.test(version)) return null;
  const parts = [
    Number(version.slice(0, 4)),
    Number(version.slice(4, 6)),
    Number(version.slice(6, 8)),
    Number(version.slice(8, 10)),
    Number(version.slice(10, 12)),
    Number(version.slice(12, 14)),
  ];
  const [y, mo, d, h, mi, s] = parts;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const date = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  // Round-trip guard: rejects a real-looking date that JS silently rolled over,
  // e.g. 31 February.
  return versionFromDate(date) === version ? date : null;
}

/** The only shape this tool can mint: a 14-digit UTC timestamp. */
const TIMESTAMP_SHAPE = /^\d{14}$/;

/**
 * The first version strictly greater than `after`, at or past `now`.
 *
 * Prefers the wall clock so a rebased migration keeps a filename that means
 * something. Falls back to one second past `after` only when the clock is
 * behind it — which happens when two rebases land in the same second, and when
 * someone's machine has a skewed clock.
 *
 * Checking is scheme-agnostic; minting is not. The clock only produces a
 * 14-digit timestamp, so on any other scheme `fromClock > after` compares two
 * alphabets and answers by accident — against Flyway's `1_3`, "2…" beats "1…"
 * and `V1_1__init.sql` becomes `V20260825193101__init.sql`.
 * @param {string} after highest version that must be beaten
 * @param {Date} now
 * @returns {string}
 */
export function nextVersionAfter(after, now) {
  const fromClock = versionFromDate(now);
  if (!TIMESTAMP_SHAPE.test(after)) {
    throw new Error(
      `Cannot compute a version after "${after}": it is not a 14-digit UTC timestamp, and a ` +
        `timestamp is the only version this tool can mint. Renaming forward would move the ` +
        `file into a different version scheme. Rename it by hand.`,
    );
  }
  if (fromClock > after) return fromClock;

  const date = dateFromVersion(after);
  if (date === null) {
    throw new Error(
      `Cannot compute a version after "${after}": it is not a UTC timestamp, and the ` +
        `current clock (${fromClock}) does not already exceed it. Rename it by hand.`,
    );
  }
  return versionFromDate(new Date(date.getTime() + 1000));
}

/**
 * The literal file extension a pattern insists on, or null when it insists on
 * none. Read off the pattern's own source, so no list of the host project's
 * file types has to be maintained anywhere.
 * @param {RegExp} pattern
 * @returns {string | null} lowercased, with the dot
 */
export function patternExtension(pattern) {
  const match = /\\\.([A-Za-z0-9]+)\$?$/.exec(pattern.source);
  return match ? `.${match[1].toLowerCase()}` : null;
}

/**
 * Whether a directory entry is a stray rather than a migration. The shell script
 * this replaced globbed `*.sql` and could not see these; reading the directory
 * sees everything, so a `.DS_Store` or a `.sql.orig` from a merge conflict would
 * otherwise count as malformed — which blocks the pre-push hook and stops
 * `--write` rebasing anything at all.
 *
 * A file carrying the migration extension that still does not match is a real
 * misnaming and stays malformed. That distinction is the point.
 * @param {string} filename
 * @param {string | null} extension
 */
export function isStrayFile(filename, extension) {
  if (filename.startsWith(".")) return true;
  if (extension === null) return false;
  return !filename.toLowerCase().endsWith(extension);
}

/**
 * Splits a filename into its version and the rest, per the caller's pattern.
 * The pattern's first capture group is the version.
 * @param {string} filename
 * @param {RegExp} pattern
 * @returns {{ version: string, filename: string } | null}
 */
export function parseMigrationName(filename, pattern) {
  const match = pattern.exec(filename);
  if (!match) return null;
  const version = match.groups?.version ?? match[1];
  return version ? { version, filename } : null;
}

/**
 * Everything wrong with a set of migration filenames, plus the moves that would
 * put it right.
 *
 * @param {object} input
 * @param {string[]} input.localFilenames every migration filename in the working tree
 * @param {string[]} input.baseFilenames the same directory as it exists on the base ref
 * @param {RegExp} input.pattern first capture group is the version
 * @param {Date} input.now
 * @returns {{
 *   line: string | null,
 *   malformed: string[],
 *   ignored: string[],
 *   duplicates: Array<{ version: string, filenames: string[] }>,
 *   offenders: Array<{ version: string, filename: string }>,
 *   moves: Array<{ from: string, to: string, oldVersion: string, newVersion: string }>,
 *   renameBlocked: string | null,
 * }}
 */
export function planRebase({ localFilenames, baseFilenames, pattern, now }) {
  const extension = patternExtension(pattern);
  const malformed = [];
  const ignored = [];
  const local = [];
  for (const filename of localFilenames) {
    const parsed = parseMigrationName(filename, pattern);
    if (parsed !== null) local.push(parsed);
    else if (isStrayFile(filename, extension)) ignored.push(filename);
    else malformed.push(filename);
  }
  local.sort((a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : 0));

  // ── Collisions ────────────────────────────────────────────────────────────
  // Two files claiming one version is fatal on its own, independent of any
  // ordering question: the migration table's primary key is the version.
  const byVersion = new Map();
  for (const entry of local) {
    const seen = byVersion.get(entry.version);
    if (seen) seen.push(entry.filename);
    else byVersion.set(entry.version, [entry.filename]);
  }
  const duplicates = [...byVersion.entries()]
    .filter(([, filenames]) => filenames.length > 1)
    .map(([version, filenames]) => ({ version, filenames }));

  // ── The line ──────────────────────────────────────────────────────────────
  const baseVersions = new Set();
  for (const filename of baseFilenames) {
    const parsed = parseMigrationName(filename, pattern);
    if (parsed) baseVersions.add(parsed.version);
  }
  let line = null;
  for (const version of baseVersions) if (line === null || version > line) line = version;

  // A file already on the base ref is not ours to move: it may well be applied
  // to a shared database, where renaming it means running it a second time.
  const localOnly = local.filter((entry) => !baseVersions.has(entry.version));
  const offenders = line === null ? [] : localOnly.filter((entry) => entry.version <= line);

  // ── Moves ─────────────────────────────────────────────────────────────────
  // When anything is stale, EVERY local-only migration moves, not just the
  // stale ones. This looks like over-reach and is the opposite.
  //
  // Offenders sort at or below the line; non-offenders sort above it; versions
  // record creation order — so every offender was written *before* every
  // non-offender beside it. Rebasing only the offenders would lift them over
  // their own younger siblings and invert that order, and a migration written
  // later is exactly the one liable to depend on one written earlier. Moving
  // the whole local set preserves their relative order, which is the property
  // that actually matters. It is also what `git rebase` does with commits, and
  // in the common case — one unmerged migration — it moves exactly one file.
  const moves = [];
  // Reported rather than thrown: `--check` must still name the offenders on a
  // scheme this tool cannot mint into. Only `--write` has nothing to offer.
  let renameBlocked = null;
  if (offenders.length > 0) {
    let previous = line;
    for (const version of byVersion.keys()) if (version > previous) previous = version;
    try {
      for (const entry of localOnly) {
        const newVersion = nextVersionAfter(previous, now);
        moves.push({
          from: entry.filename,
          to: entry.filename.replace(entry.version, newVersion),
          oldVersion: entry.version,
          newVersion,
        });
        previous = newVersion;
      }
    } catch (error) {
      moves.length = 0;
      renameBlocked = error instanceof Error ? error.message : String(error);
    }
  }

  return { line, malformed, ignored, duplicates, offenders, moves, renameBlocked };
}

/**
 * Where a version string is cited in a body of text.
 *
 * Renaming a file without following its citations trades a loud failure for a
 * quiet one: this repo cites versions in other migrations, in feature docs and
 * in function comments, and a dangling citation still reads as authoritative.
 *
 * Digit-boundary guarded so `20260825073922` never matches inside a longer run
 * of digits.
 * @param {string} text
 * @param {string} version
 * @returns {number} number of occurrences
 */
export function countVersionCitations(text, version) {
  const matches = text.match(new RegExp(`(?<![0-9])${version}(?![0-9])`, "g"));
  return matches ? matches.length : 0;
}

/**
 * `text` with every standalone occurrence of `from` replaced by `to`.
 * @param {string} text
 * @param {string} from
 * @param {string} to
 * @returns {string}
 */
export function rewriteVersionCitations(text, from, to) {
  return text.replace(new RegExp(`(?<![0-9])${from}(?![0-9])`, "g"), to);
}
