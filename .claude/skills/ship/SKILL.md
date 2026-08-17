---
name: ship
description: Full pre-ship gate — typecheck, lint, tests, migration versions, conventions review, and a security audit when the schema changed. Use when work is finished and about to be committed or pushed. Run it before saying anything is done.
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

## Step 3 — Migration versions, if migrations changed

```bash
sh scripts/check-migration-versions.sh
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

Baseline is **87 findings** (12 Aug 2026). The count rises with ordinary
feature work, so a rising number is not the signal — **a name you cannot
account for is.** Resolve anything new before pushing.

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
