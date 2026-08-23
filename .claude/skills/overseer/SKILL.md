---
name: overseer
description: Run a significant story as overseer + executor subagents — story slicing, spec template, file-disjoint waves, and the integration gate. Invoke at the start of any issue-sized feature or multi-file refactor; CLAUDE.md makes this the default execution model.
user-invocable: true
---

# The Overseer Pattern

You (the session's model — Fable or Opus, the pattern is helm-agnostic) orchestrate
and review; `sonnet` subagents type. CLAUDE.md's "Overseer Pattern" section makes
this the **default** for any significant story and defines the two exits (user says
solo; or you judge delegation inefficient — state either aloud in one line). This
skill is the procedure.

## Not to be confused with

The **advisor pattern** — the inversion: a `sonnet` agent leads the work and consults
Fable/Opus subagents at judgment moments. Use it when the work is long and mechanical
but has a few isolated hard calls (a big migration sweep with one tricky schema
decision). Overseer = judgment on top, hands below. Advisor = hands on top, judgment
on call.

## Procedure

### 1. Recon (yours, not delegated)

Read the issue and the owning `context/features/` doc. Establish the verified facts
executors will need: schema locations, existing idioms to copy, quirks — each with
`file:line`. An executor given wrong facts implements them faithfully.

### 2. Slice into stories

A story = one coherent change with an explicit file list. Slice for **file
disjointness**, not size symmetry. Shared code stabilizes first (a refactor story
before the stories that build on it), then dependents fan out in parallel waves.
Stories sharing a file run in sequence, never concurrently.

### 3. Spec each executor

Launch with `model: "sonnet"` (haiku only for pure lookups). Every spec contains:

- **Verified facts to trust** — from your recon, with `file:line`. Never "find out".
- **Files owned** — an explicit list; everything else is read-only.
- **Do-not-touch list** — files other agents or the user have in flight, by name,
  plus "unrelated dirty files in git status are expected".
- **Applicable conventions** — the CLAUDE.md/memory rules that bite for this story
  (no `any`, no `?? ""` coercion, Vue 3.5 props, tests colocated, primitives not
  hand-rolled chrome, rem not px).
- **Hard boundaries** — no commits, no pushes, no migrations (report needed SQL
  instead), no GitHub writes, no touching the DB.
- **Required verification** — which commands must be green before the agent reports,
  and that its final message is a file-by-file change list + results.

### 4. Review and gate (yours, never delegated)

Read every diff yourself. An executor's green report is a claim, not a verification:

1. `npx vue-tsc --noEmit -p tsconfig.app.json`
2. `npx vitest run` (full suite)
3. **`npm run build`** — non-negotiable when any `.vue` file changed: vue-tsc and
   vitest have both missed a malformed SFC that only the vite build caught.
4. Conventions review (the `conventions-reviewer` agent) scoped to exactly the
   story's files.
5. UI changed → look at it running (`dm-fixture@example.invalid`, never the admin).
6. Schema changed → `/ship`'s security audit path applies.

### 5. Land it (yours)

Commits staged by explicit pathspec so in-flight foreign work stays out; issue
lifecycle updates; user sign-off before committing a completed feature
("I think we're done, do you agree?").

## Failure modes this exists to prevent

- Two agents in one file → merge chaos in a shared checkout. Waves exist for this.
- An agent "fixing" the user's uncommitted work → the do-not-touch list exists for this.
- Accepting a green *report* without re-running the gates → the WeaponMasteryBadge
  stray-tag incident exists for this.
- The top model typing 400 lines of spec-determined code → the pattern itself exists
  for this.
