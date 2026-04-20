---
name: resolve-issue
description: Fetch a GitHub issue from irongollem/grimoire and implement the fix or feature. Use when the user references an issue number (e.g. "/resolve-issue 12" or "@issue 12").
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - Agent
  - mcp__github__get_issue
  - mcp__github__add_issue_comment
  - mcp__github__update_issue
  - mcp__supabase__execute_sql
---

# /resolve-issue — Implement a Grimoire GitHub Issue

Arguments: `$ARGUMENTS`

Parse `$ARGUMENTS` to extract the issue number (strip leading `#` if present).
If no number is provided, ask the user which issue to work on.

---

## Step 1 — Fetch the issue

Run `git remote get-url origin` and parse `owner` and `repo` from the result.
Handles both SSH (`git@github.com:owner/repo.git`) and HTTPS (`https://github.com/owner/repo.git`) formats.

Then use `mcp__github__get_issue` with the parsed `owner`, `repo`, and `issue_number: <N>`.

Read the **title**, **body**, **labels**, and **comments** carefully. Labels tell you the scope:

- `bug` — something broken that needs fixing
- `enhancement` — new feature or improvement
- `player views` — touches `/play/*` routes (player portal)
- `dm views` — touches DM-side views
- `regression` — treat with extra care; verify the fix doesn't break adjacent flows

If the issue has comments (`comments > 0`), fetch them with `gh issue view <N> --comments --json comments --jq '.comments[].body'`. Comments often contain clarifications, reproduction steps, or decisions from the reporter or maintainer that refine the scope beyond what the body says.

**If the issue has no body**, write one now using `mcp__github__update_issue` before proceeding. The body should contain:
- A **Summary** paragraph explaining what the issue is asking for in plain language
- **Use cases** (bullet list) — why someone would want this
- **Proposed implementation** (bullet list) — your plan at a high level

This confirms shared understanding before any code is written. Keep it concise (no need for full spec).

Summarise what the issue is asking for in one sentence before proceeding.

---

## Step 2 — Explore the codebase

Based on the issue description, identify the relevant files. Use Glob and Grep to find:

- The Vue component(s) involved
- The composable / TanStack Query hook involved
- Any Pinia store involved
- Any Supabase migration needed

Useful search patterns:

- Component names are PascalCase in `src/components/` or `src/views/`
- Composables are in `src/composables/use*.ts`
- Types are in `src/types/*.types.ts`
- DB migrations are in `supabase/migrations/`

Read the relevant files before touching anything.

---

## Step 3 — Plan

Before writing any code, state:

1. What you will change (files + what change)
2. Whether a DB migration is needed
3. Any edge cases or risks

If the issue is a **bug**: identify the root cause first, don't just patch symptoms.
If the issue is an **enhancement**: keep changes minimal and focused — don't refactor unrelated code.

---

## Step 4 — Implement

Follow all project conventions from CLAUDE.md:

**Migrations** (if needed):

- File: `supabase/migrations/YYYYMMDDNNNNNN_name.sql`
- Always add `updated_at` trigger using `execute procedure update_updated_at()`
- Always add RLS + four policies (select/insert/update/delete)
- Apply with `supabase db push` — NEVER use `mcp__supabase__apply_migration`

**Navigation after mutations:**

- Create → `router.push('/resource-list')`
- Save → `router.push('/resource-list')` (or parent detail for nested resources)
- Delete → `router.push('/resource-list')`

**Component rules:**

- All multi-line text: `RichTextEditor`, never `<textarea>`
- All images: `FocalImage`, never `<img>`
- Tailwind v4 only — no `tailwind.config.js`, use `@theme` in CSS, canonical class names

**State:**

- Server/async state: TanStack Query (`useQuery`/`useMutation`)
- UI state only: Pinia
- Do NOT use `onSuccess` callbacks (deprecated) — handle outcomes inline

---

## Step 5 — Update tracking files

After implementing, add a `[x]` entry to the relevant local file:

- Bug issue → `BUGS.md` — one-line summary of root cause + fix
- Enhancement issue → `ROADMAP.md` — one-line summary of what was built

Do NOT add `[ ]` items. These files are a history log only.

---

## Step 6 — Close out

Tell the user: **"I think we're done — do you agree?"**

Do NOT commit. Wait for the user to confirm the implementation looks correct before committing.

Once the user confirms:

1. Commit following the project's git conventions (conventional commits, Co-Authored-By trailer)
2. Close the GitHub issue: `mcp__github__update_issue` with the parsed `owner`, `repo`, `issue_number`, `state: "closed"`, and a `body` structured as follows — preserve the original issue text as a blockquote at the top, then add the resolution below it:

```
> <original issue body, with each line prefixed by "> ">

---

**Resolution:** <what was actually built, any out-of-scope decisions, related issues/PRs>
```

If the original body is very long (> ~20 lines), summarise it in the blockquote instead of quoting verbatim.
