# migration-rebase

Keeps migration versions ahead of the branch you will merge into, and renames
them forward when they are not.

```bash
npm run migrations:check     # exit 1 if anything is wrong  (runs in CI)
npm run migrations:rebase    # rename forward, fixing every citation
npm run hooks:install        # once per clone: refuse to push a stale migration
```

## The problem

A migration filename records when it was **created**. The database enforces the
order in which migrations were **merged**. Those are different orders the moment
two pieces of work exist at once, and nothing reconciles them.

Two failures follow, both of which have reached this project's production:

- **Collision** — two files claim one version, `db push` dies on the migration
  table's primary key, and everything queued behind it is stranded.
- **Out of order** — a migration is authored, something else merges and deploys
  first, and by the time it lands its version is in the past. `db push` refuses
  it. The frontend deploys off the same push through a different pipeline, so
  the app ships anyway against a schema that never got the change.

The second is the expensive one, and on 25 Aug 2026 it happened with **no branch
and no pull request**: two agents were working in git worktrees, and one held a
timestamp for seven hours while the other merged four migrations. Branch
protection and merge queues — the usual answers — do nothing there. Parallel
agents reproduce the multi-developer merge problem in repos that never open a PR.

## What it knows about this project

Nothing. It never connects to a database, never parses SQL, and reads only
filenames and text. A *version* is whatever the configured pattern captures; the
base ref comes from git. It has no dependencies and no install step, which is
what lets it run in CI before `setup-node` and inside a pre-push hook.

Point it at another layout with `--dir` / `--pattern`, or a `migration-rebase.json`:

```json
{ "dir": "db/migrate", "pattern": "^(?<version>\\d{14})_.+\\.rb$", "baseRef": "origin/main" }
```

## Two decisions worth knowing before you change it

**When anything is stale, every local-only migration moves — not just the stale
ones.** Offenders sort at or below the line and non-offenders above it, and
versions record creation order, so every offender was written *before* every
non-offender beside it. Rebasing only the offenders lifts them over their own
younger siblings and inverts that order — and the migration written later is
exactly the one liable to depend on the one written earlier. Moving the whole
local set preserves their relative order, which is the property that matters. In
the common case, one unmerged migration, it moves one file.

**Citations are rewritten before anything is renamed, and nothing is excluded.**
Migrations, feature docs and function comments all cite version numbers here, and
a dangling citation still reads as authoritative. Collecting citations after the
rename silently misses the file's own body, because a path that no longer exists
is indistinguishable from a file with nothing to rewrite. Both orderings shipped
as bugs; the integration tests in `cli.test.mjs` exist to keep them fixed.

## Layout

| File | Contains |
| --- | --- |
| `core.mjs` | Pure logic — version arithmetic, the rebase plan, citation matching. No IO |
| `io.mjs` | The only file that touches git or the disk |
| `cli.mjs` | Argument parsing, config resolution, output |
| `core.test.mjs` | Unit tests, including the 25 Aug incident as a fixture |
| `cli.test.mjs` | Integration tests against real throwaway git repositories |
