---
name: ship
description: Full pre-ship gate — typecheck, lint, tests, performance budgets, migration versions, conventions review, and a security audit when the schema changed. Use when work is finished and about to be committed or pushed. Run it before saying anything is done.
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
  - Agent
  - mcp__github__update_issue
  - mcp__github__add_issue_comment
  - mcp__github__create_issue
  - mcp__supabase__get_advisors
---

# /ship — the gate between "it works" and "it's done"

Arguments: none, or an issue number to close (`/ship 742`).

Every push runs build, lint and the test suite, and they pass today. The point
of running them here is that a red CI on `main` is not a failed check — it is a
**stranded release**, because Vercel ships the frontend off the same push
through a different pipeline. That is how the #649 release put production code
in front of a schema that never got its migration.

## Rule for this whole skill

**Anything that surfaces a problem, you fix, then re-run the step.** Not "note
it", not "flag it as pre-existing". Read the top of `CLAUDE.md` if you feel the
urge to establish provenance — the urge itself is the tell. The only two exits
are another agent's in-flight uncommitted work (name the file) or a fix that
genuinely exceeds this change's blast radius (then it gets its own commit or a
GitHub issue **in this session**, and you say which you did).

---

## Step 1 — What changed

```bash
git status --short && git diff --stat HEAD
```

Note whether the diff touches `supabase/migrations/`, `supabase/functions/`, or
`src/`. Later steps branch on this.

## Step 2 — Application gate

```bash
npm run verify
```

That is `lint && test && build`, and `build` is `vue-tsc -b && vite build`, so
this is the typecheck too. It is exactly the `application` job in CI.

Run it as one command — do not run the three separately and reason about which
matter. All three matter equally.

If it fails: fix, re-run the whole thing. A partial re-run proves nothing about
the steps you skipped.

## Step 2b — Code-file budgets, from the build Step 2 just made

```bash
npm run perf:code
```

CI's performance job counts the chunks and stylesheets each journey fetches
(`codeRequests` in `scripts/perf/budgets.json`) in a real browser, minutes
after the push. This predicts the same counts from `dist/` in a second, and it
has matched CI's run exactly on every journey step. The breach it exists for
is the common one: a shared chunk that grew past the 8 kB inline threshold
becomes a file of its own, and the dashboard fetches one more. It names the new
file.

Over budget, decide which it is. A file the page should not need: keep it off
the page. A file that is now shared rather than copied (the usual case): raise
`codeRequests` in `budgets.json` for the steps it names, and add the reason to
its `$comment`, as the 5 Nov and 6 Nov entries do. Under budget: lower the
number in the same change.

## Step 2c — Request budgets, if `src/` changed

```bash
npm run perf:budgets
```

`perf:code` cannot see API requests or serial depth; only the real journeys
can. This runs them as CI's performance job does (synthetic fixture, three runs,
`check-budgets.ts`) on the local stack, in a few minutes. It needs the local
Supabase stack up and nothing on port 4173. Skip it only when the diff touches
no file under `src/` (a migration, a script, a doc): say so in one line.

The performance job fails *after* the push, on `main`, and it went red three
pushes in a row on 16 Nov 2026 because nobody had run this before pushing. A
red budget is not a reason to push and see; it is a decision to make here:

- **Over on `apiRequests`.** Find the new reads (the journey's network log, or
  the diff's new `useQuery` calls on the dashboard, the Hearth or the app
  shell). First ask whether the page needs them at load at all: a read only an
  open panel uses waits for the panel. Then whether they can share a request
  with each other or with an existing read (one batched request, as the
  soundboard deck does in `lib/audio/deck/deckBatch.ts`). What is left is
  earned: raise the number for the steps it names and write why in
  `budgets.json`'s `$comment` (which reads, which feature, why at load).
- **Over on `serialDepth`.** A read now waits on another. Start it in parallel
  instead; raising depth needs CI's own measurement, as the comment's 4 Nov
  entry records.
- **Under budget.** Lower `apiRequests` or `codeRequests` in the same change,
  so the win cannot be lost unnoticed. A local "below budget" on `serialDepth`
  is not one: a laptop is faster than CI's runner and shows shallower chains,
  and that ceiling is the deepest CI has measured on `main`. Leave it.
- **Which reads?** `perf-results/ship.json` holds every request of the run;
  `rg -o 'rest/v1/(rpc/)?[a-z_]+' perf-results/ship.json | sort -u` lists the
  tables and functions the journeys touched.

Raising a budget is allowed; raising it without a written reason is not. The
`$comment` is the evaluation, and a reviewer reads it.

## Step 3 — Migration versions, if migrations changed

```bash
node scripts/migration-rebase/cli.mjs --check
```

Two failure modes, both filename arithmetic, both catastrophic and both silent
until release:

1. **Two files, one version** → `duplicate key value violates unique constraint
   "schema_migrations_pkey"`, and every migration queued behind it is stranded.
2. **A version at or below the newest already applied** → `db push` refuses it.
   This is the nastier one, and it is why **a migration that has sat on a branch
   while other work merged must be renamed forward before it merges.**

If you rename one, `rg` the repo for the old version string first — migrations,
feature docs and function comments all cite version numbers.

## Step 4 — Database gate, if migrations or functions changed

```bash
npm run verify:db
```

Resets the local stack, runs the pgTAP suites, then the three guard scripts
(content integrity, its self-test, and the embed resolver). The local stack
works; use it. Do **not** run `supabase db push` — migrations auto-apply from
CI on push to main, and pushing by hand sweeps up every other session's
unmerged migrations in your working tree.

## Step 5 — Security audit, if the schema changed

If the diff adds or changes any function or policy, launch the
`security-definer-auditor` subagent on it.

This is not optional and not a formality. The bug class it targets — a guard
that is present, reads correctly, and never fires because its predicate returns
NULL — passed a dedicated human audit and leaked another account's billing
history. Neither the advisor nor grep can see it.

Then:

```
mcp__supabase__get_advisors({ type: "security" })
```

Read it by category, not total. A client-callable definer function is proven
by `supabase/tests/definer_refusal_registry.test.sql` and its vitest cross-check
(#936), which the test step above already ran: a new RPC fails the suite until
it is registered with a refusal test. Any category other than the definer,
no-policy and `pg_net` findings is a regression until explained. Resolve
anything new before pushing.

## Step 6 — Conventions review (always)

Launch the `conventions-reviewer` subagent on the diff. **Every time**, whatever
the change touched.

It runs on every ship because convention drift is not a property of risky
changes — it is a property of long sessions. The write-time hook
(`.claude/hooks/convention-guard.sh`) already caught the mechanical rules; this
catches the ones needing judgement: primitives, px, null coercion, filter state,
component extraction, module placement.

Steps 5 and 6 are independent — launch both in one message so they run
concurrently.

Act on **Must fix**. For **Consider**, either fix it or say out loud why the
exception applies. Do not silently drop it.

## Step 7 — Feature docs

Did this change a feature covered by `context/features/`? Check
`context/features/index.md` for the mapping and update the doc. It lists exact
file paths, composables, types and DB tables, and a doc that has drifted is
worse than no doc, because the next worker will trust it.

Touched an AI generator? `context/compliance/ai-act.md` too.

There is no changelog. The record of *why* is a comment at the point of the
decision — in the code, the migration, or the feature doc.

## Step 8 — Report, then stop

Summarise:

- what changed, in one or two lines
- each gate that ran and its result — **green means clean.** If your summary
  contains both "passing" and a caveat, the work is not done. Go back.
- what the two subagents found and what you did about it
- anything you deliberately left, which exit it took, and the issue number if
  you filed one

Then ask: **"I think we're done, do you agree?"**

## Step 9 — Only after the user agrees

**Commit** directly to `main` locally (this repo's normal flow; branch only when
asked).

**Close the issue**, if one was given, with `mcp__github__update_issue`
(`state: closed`) and a descriptive body saying what actually shipped. If the
issue was reported by someone else, reply with
`mcp__github__add_issue_comment` — never edit their original body.

**Do not push.** Ask, every time. A one-time push approval is not standing
permission, and this is `main`: the push is the release.
