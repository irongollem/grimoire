# Grimoire — Claude Code Instructions

## Leave the Plate Clean — read this before you report anything as done

**If a check you ran surfaces a problem, you fix it. There is no second question.**

This rule keeps getting broken, always the same way: a lint error, type error, failing test or broken reference shows up in output you asked for, and instead of the one-line fix it gets *explained*. That explanation is the violation. These phrasings are banned — not discouraged, banned:

- "pre-existing" / "already failing on `main`" / "was there before my change"
- "not mine" / "I never touched that file" / "unrelated to this work"
- "out of scope" / "not part of this issue" / "worth a follow-up"

**The tell to watch for in yourself:** the moment you start establishing *provenance* — running `git stash`, `git blame`, or diffing against `main` to work out whether the problem is yours — stop. That investigation costs more than the fix. Wanting to know whose fault it is means you have already decided to skip it. Just fix it.

**"Green" means clean.** Never report a check as passing while narrating an exception to it. `lint: 1 error` is a failing lint run, whoever wrote the line. If your summary contains both "green" and a caveat about a warning, the work is not done.

**The baseline is green, and it stays green.** Every push runs build, lint and the test suite, and they pass today. So a lint error, type error or failing test you find in this repo is not "the normal state of things" — it is an accident a previous worker left behind, and finding it makes it yours. Fix it and the baseline is clean again; explain it away and it becomes permanent, because the next worker will read it as pre-existing too. That is precisely how it survives.

Same rule forward in time: no "we'll refactor later", no "we'll extract this when we do the next one", no knowingly-added technical debt, no deferring the hard part of a task because the easy part is finished.

**The only two exits**, and both require saying so out loud:

1. It is another agent's or the user's in-flight uncommitted work — leave it alone and name the file.
2. The fix genuinely exceeds this change's blast radius (a real refactor, a schema change, a dependency bump). Then it gets its own commit or a GitHub issue **in this same session**, and you say which one you did.

"I noticed it and left it" is never an option. If you are unsure which exit applies, fix it.

## The Overseer Pattern — the default for any significant story

**Any significant story — an issue-sized feature, a multi-file refactor, anything with more than one natural work package — is executed as overseer + executors by default.** The session's model orchestrates and reviews; cheaper subagents type. This is not an optimization to reach for when asked; it is how work runs here unless one of the two exits below applies. The full procedure (story slicing, spec template, waves, gates) is the **`/overseer` skill — invoke it when starting such a story.** Its inversion — a sonnet lead consulting Fable/Opus subagents at isolated judgment moments — is the *advisor pattern*, defined there too.

**The overseer (the session's model) keeps:** recon and audits, architecture and scoping decisions, writing each executor's spec, reviewing every diff, running the gates, migrations and DB writes, git commits, GitHub issue lifecycle, and user communication.

**Executors (`model: "sonnet"`; haiku for pure lookups):** one well-specified story each. Every spec includes: the verified facts they should trust (schema locations, API quirks — with file:line), an explicit list of files they own, the conventions that apply, and hard boundaries — no commits, no pushes, no migrations (report needed SQL instead), no GitHub writes, and no touching files another agent or the user has in flight (name those files in the prompt).

**Waves by file overlap:** stories with disjoint files run in parallel in the shared checkout; stories sharing a file run in sequence. Structure work so shared code stabilizes first, then fan out dependents.

**The integration gate is typecheck + full vitest + `npm run build`** — vue-tsc and vitest have both missed a malformed .vue SFC that only the vite build caught. Never accept agent-written .vue files without a build run. The overseer re-runs the gates itself; an executor's green report is a claim, not a verification.

**The two exits**, both said out loud in one line when taken:

1. The user explicitly says to work solo on this one.
2. The overseer judges delegation inefficient — the change is small enough that writing the spec costs more than the work (a config line, a one-file fix, a doc edit). State the judgment; don't silently default to solo.

Model choice for the *overseer* follows the judgment load, not habit: a spec-executable story (the ticket already contains the decisions) runs fine with Opus at the helm; judgment-heavy work — UX design, security-sensitive review, architecture — warrants the top model. Session model is the user's call; this paragraph is for recommending one when asked.

## Supabase Migration Rules

**CRITICAL — updated_at trigger pattern:**

Every new table needs an `updated_at` trigger. Always use this exact form:

```sql
create trigger <table>_updated_at
  before update on <table>
  for each row execute procedure update_updated_at();
```

- Function name: `update_updated_at()` — defined in the initial schema migration
- Keyword: `execute procedure` (not `execute function`)
- Wrong (DO NOT USE): `update_updated_at_column()`, `set_updated_at()`, `moddatetime()`

**RLS pattern** — every table also needs RLS enabled + four policies:

```sql
alter table <table> enable row level security;

create policy "<table>_select" on <table> for select using (auth.uid() = user_id);
create policy "<table>_insert" on <table> for insert with check (auth.uid() = user_id);
create policy "<table>_update" on <table> for update using (auth.uid() = user_id);
create policy "<table>_delete" on <table> for delete using (auth.uid() = user_id);
```

Migration files live in `supabase/migrations/` with the Supabase CLI's own prefix, `YYYYMMDDHHMMSS_name.sql` (14-digit UTC timestamp to the second).

**CRITICAL — `SECURITY DEFINER` functions (avoid re-introducing the security-advisor warnings):**

A `SECURITY DEFINER` function in the `public` schema is auto-published by PostgREST as an `/rest/v1/rpc/<name>` endpoint callable by `anon`/`authenticated`. Two recurring mistakes, both flagged by `mcp__supabase__get_advisors({ type: "security" })`:

1. **RLS-helper predicates must NOT live in `public`.** Any function used inside an RLS policy (an `is_*`/`can_*`/`owns_*`-style boolean, or anything called from a `USING`/`WITH CHECK`) goes in the **`private`** schema and is referenced as `private.is_campaign_member(...)`. PostgREST does not expose `private`, but `authenticated`/`anon` keep `USAGE` + `EXECUTE` so RLS still resolves it. Do NOT try to revoke `EXECUTE` from `authenticated` to "hide" a public helper — that breaks every policy that references it (`permission denied for function`). Relocation is the only correct fix. See migration `20260629000002` and [private-schema memory] for the mechanical relocation pattern.

2. **Every client-callable `SECURITY DEFINER` RPC must authorize internally, as its first act.** Because it runs with the definer's privileges (bypassing RLS), it must re-derive identity from `auth.uid()` — never trust a caller-supplied `p_user_id`/`p_claimer_id` — and gate on `is_app_admin()` / `private.is_campaign_member(cid)` / explicit ownership before doing any work. The `grab_item_drop` bug (fixed in `20260629000002`) shipped without this and let any user act in any campaign. Mirror the sibling RPC's check; if no sibling exists, add the `auth.uid()`/membership/admin guard explicitly.

3. **An authorization predicate must be total — true or false, never NULL.** A guard can be present, correct-looking, and do nothing. `private.is_app_admin()` was `select (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'`, and an ordinary user's JWT has no `role` key, so it returned **NULL**. `not NULL` is NULL, `if NULL then` does not fire, and `if not private.is_app_admin() then raise exception 'Not authorized'; end if;` fell straight through into the privileged body — in five functions at once, including `get_user_ledger`, which handed any authenticated user another account's billing history. Fixed in `20260809144926` with `coalesce(..., false)`; regression cover in `supabase/tests/admin_authorization_guards.test.sql`.

   Note *why* this hid for so long: used affirmatively, NULL is safe. `USING (private.is_app_admin())` denies on NULL exactly as it denies on false, so every RLS policy built on the helper always behaved correctly and the advisor read clean. Only the negated form breaks. So when you write a boolean helper for authorization, `coalesce` it at the source rather than at each call site, and when you read one, do not stop at "the comparison looks right" — ask what it returns when the key, claim or row is **absent**, which is the case an attacker is in.

4. **`private.is_app_admin()` is the only thing allowed to read `app_metadata ->> 'role'`. Never inline the comparison.** Fixing a helper only reaches the call sites that go through it, which is the sting in the tail of item 3: `20260809144926` coalesced the helper, but `get_admin_users` and `get_credit_calibration_hints` had each copied the claim comparison inline instead of calling it, so both kept the NULL bypass and neither appeared on that migration's list of five. `get_admin_users` was handing every account's email, plan, credit balance and ban state to any logged-in user for as long as it existed — the same leak as `get_user_ledger`, surviving the fix for it. Closed by `20260809222131` (#640), which also converted the two affirmative inline copies (`check_quota`, `check_all_quotas`) and the last 18 RLS policies, so the claim now has exactly one reader.

   Two structural assertions at the bottom of `supabase/tests/admin_authorization_guards.test.sql` fail if any function or policy in `public` compares the claim inline again — deliberately body-based, because an outcome test only covers a guard someone remembered to write, and what went wrong here was a call site that never routed through the helper at all. Three functions read a role legitimately and are excluded by construction: `is_user_pro` (reads `raw_app_meta_data` for an *arbitrary* user id — the helper only knows the caller), `prepare_user_erasure` (reads the top-level `service_role` claim, a different claim), and `consume_app_invite` (which *writes* the role — that is the grant, not a gate).

Also: trigger functions never need an `EXECUTE` grant (the trigger system bypasses the check), so `revoke execute on function public.<trigger_fn>() from public, anon, authenticated;` to keep them off the RPC surface. Login-only RPCs should `revoke execute ... from public, anon;` then `grant execute ... to authenticated, service_role;` (anon's access comes via the `PUBLIC` grant, so revoking from `anon` alone is a no-op).

**Always run `get_advisors({ type: "security" })` after any migration that adds/changes a function or policy**, and resolve new findings before pushing.

**CRITICAL — migration workflow (prevents timestamp mismatch):**

NEVER use `mcp__supabase__apply_migration` for schema changes. It auto-generates its own timestamp that will never match the local file's timestamp, causing `supabase db push` to diverge every time.

**CRITICAL — never pick a migration version by hand:**

Use `/new-migration <name>`, or `supabase migration new <name>` directly. Both stamp a UTC `YYYYMMDDHHMMSS`. A timestamp to the second is not *chosen*, so two sessions cannot land on the same one — which a hand-picked counter did twice in a week, because choosing it means reading the state of a repo that several sessions are writing to at once.

Two things go wrong with versions, and CI now catches both (`node scripts/migration-rebase/cli.mjs --check`, run in the `spell-database` job):

1. **Two files, one version** → `duplicate key value violates unique constraint "schema_migrations_pkey"`, and every migration queued behind it is stranded.
2. **A version at or below the newest already applied** → `db push` refuses it: *"Found local migration files to be inserted before the last migration on remote database."* This is the nastier one, because Vercel deploys the frontend off the same push through a different pipeline, so the app ships against a schema that never got the change. It killed the #649 release on 9 Aug 2026.

Mode 2 is why a migration that has sat on a branch while other work merged must be **renamed forward before it merges**. Run the script yourself before opening the PR — it is instant, and it is far cheaper than a red release. If you do rename one, grep the repo for the old version string first: migrations, feature docs and function comments all cite version numbers.

Workflow:

1. Invoke `/new-migration <name>`
2. Write the SQL body into the created file
3. Push to main — **migrations auto-apply from CI**. Do NOT run `supabase db push` by hand: it applies every pending migration in your working tree, including other sessions' unmerged ones.

## Post-Mutation Navigation

After any create, save, or delete operation, always navigate back to the list view — this confirms the action succeeded.

- **Create** → `router.push('/resource-list')`
- **Save (edit)** → `router.push('/resource-list')`
- **Delete** → `router.push('/resource-list')`

Never stay on the detail/editor page or navigate to the newly created resource's detail page. The list view is the success feedback. In the case of nested resources (e.g. locations), navigate to the parent resource's detail page instead unless its the top of the hierarchy.

## Git Conventions

Conventional-commit subject (`feat(npcs): …`, `fix(atlas): …`), and one trailer:

```text
Co-Authored-By: <Model Name> <noreply@anthropic.com>
```

**Model name only — no parenthetical session details.** `Claude Opus 5`, not `Claude Opus 5 (1M context)`. Git keys a co-author on the whole name, so the suffix forks one model into two contributors: across the history so far `Claude Opus 5` splits 123/19, `Claude Opus 4.8` 203/18. A context window is a property of the session that produced the commit, not of the change or of who wrote it, and nobody reading the log later can act on it.

Recording *which* model wrote a commit is deliberate and worth keeping — fifteen have contributed here. It is only the session configuration that does not belong.

**This overrides the trailer template in your own instructions.** Several harnesses ship a fixed example that includes the suffix, which is where every one of those 366 commits came from — an agent following its default rather than disobeying anything. Follow the form above instead; that is what this section is for.

Existing history stays as it is; a `filter-repo` pass over 1,700 commits would invalidate every hash already cited from a closed issue.

## Work Tracking

GitHub issues on `irongollem/grimoire` are the single source of truth for open work. When you finish something, close the corresponding issue with `mcp__github__update_issue` (`state: closed`).

There is no change log to update. The record of what shipped is the git history, and the record of *why* is a comment at the point of the decision — put it in the code, the migration, or the relevant `context/features/` doc, where the next person to touch that line will actually be standing.

## The Knowledge Graph — query it before you grep for structure

There is a graphify knowledge graph of this repo. **When `graphify-out/graph.json` exists, reach for it before ripgrep for any question about structure or consequence** — "what depends on X", "what breaks if I change Y", "how does the level-up flow hang together", "what connects the encounter runner to the quest runtime". One traversal beats a dozen greps across 2,500 files, and it answers the question greps cannot: *why*. The doc extraction stores design rationale as node attributes, so the graph remembers things like why `guard_item_entry_anchors` exists (a `WITH CHECK` policy cannot see `OLD`) or why the disguise rule withholds the true name from the model rather than instructing it to hide one.

```bash
graphify query "how does a player claim a character?"   # BFS traversal, broad context
graphify query "..." --dfs                              # trace one specific path
graphify affected "useCampaignLiveSync"                 # reverse traversal: what breaks if I change this
graphify path "EncounterRunner" "quest_runtime"         # shortest path between two things
graphify explain "useCampaignLiveSync"                  # plain-language node explanation
graphify god-nodes                                      # the architectural hubs, most-connected first
```

`affected` is the one to reach for before a refactor — it walks edges backwards, so it answers "who depends on me", which is the question a forward search keeps failing to answer.

Ripgrep is still right for a literal string, a single known symbol, or anything where you already know the file. The graph is for breadth and for consequence.

**It does not know the database.** This is the limit that matters here, and it is not a small one. The graph contains the `.sql` *files*; production runs the *applied* schema, and those diverge — see the schema-drift rule in the migration section. Every bug found in the 28 Aug 2026 security pass lived in `pg_policies`, `pg_proc` and `reloptions`: a policy whose `WITH CHECK` never consulted `campaign_id`, a view that lost `security_invoker` because a later `create or replace view` silently reset it. No source-level tool can see any of that. **For RLS, grants, policies and function bodies, query the live database, not the graph.** Treating the graph as authoritative there is how you conclude a boundary is sound when it is not.

**Rebuild it, don't trust it blindly.** `graphify-out/` is gitignored — derived, per-machine, and full of absolute paths that have no business in a public repo. It also starts drifting the moment anyone commits. `/graphify .` rebuilds; `/graphify . --update` re-extracts only what changed. If `graph.json` is absent, the graph simply does not exist yet — build it or use ripgrep, but never answer from an imagined one.

**One trap when rebuilding: install the SQL parser.** Without `tree_sitter_sql`, graphify skips every `.sql` file and mentions it once in a warning you will scroll past — 448 files, the entire `supabase/` layer, silently absent from a graph that otherwise looks complete. `uv tool install --upgrade "graphifyy[sql]"`. Adding it took this repo from 18,839 to 20,713 nodes.

## Seeing the App — local sign-in

You can look at the running app. Do it before reporting UI work as done; a green build says nothing about layout, density, or whether a control reads as chrome.

```bash
npm run db:start     # local Supabase (skip if already up)
npm run dev:auth     # ensure local accounts + known password
npm run dev          # already --mode localdb
```

`dev:auth` (`scripts/dev-auth.ts`) sets `grimoire-local-dev` as the password on three **local** accounts and prints them. It reads the running stack's own keys from `supabase status` and **refuses to run against anything but loopback**, so it cannot address the hosted project. Remote work still needs a real token, via the Supabase MCP as usual. Player-portal surfaces specifically need the player fixture: `/play` is lens- and role-guarded away from DM accounts, so no amount of DM-fixture testing reaches them.

**Sign in as `dm-fixture@example.invalid`, not the admin.** `seed.sql` is a dump of real data, so every row belongs to whoever pulled it — the admin — which leaves the admin as the only account with anything in it. That is precisely the fixture that hid #736: an RLS-scoped read path tested clean as admin and broke every real user. `dev:auth` clones a campaign and its locations onto a plain non-admin user for this reason. Use the admin login only when you are specifically exercising an admin path.

Do **not** add an `import.meta.env.DEV` auto-login to `src/` instead. The repo is public, so auth-bypass-shaped code is readable whether or not it ships; and because every read is RLS-scoped on `auth.uid()`, a faked client session renders zero rows — you would be checking layouts against an empty world.

## Sanctioned Exceptions

Deliberate departures from the rules above and in the feature docs. They look like oversights, get "fixed", and regress — so they are written down.

- **Native `<textarea>` for AI-prompt fields.** The ~40 model-prompt boxes (`*GeneratorPanel`, `*GenerateDialog`, `AdminPromptsTab`) stay native rather than becoming `RichTextEditor`. Rich text in a prompt box is wrong — the model receives markup as content.
- **px is kept** for borders and outlines, box/text/drop shadows, `@media` / `@container` breakpoints, `9999px` pills, hairline dividers, and SVG user-space `<text>`. Everything else is rem. These are the cases where a rem value scales into a visual bug.
- **Crafting has no toast, on purpose.** `CraftAttemptDialog` already surfaces errors inline via `attemptError`; a toast would double up. An absence cannot self-document, hence this line.
- **Four packages are denied install scripts and one is allowed — `npm approve-scripts --all` undoes the review.** The `allowScripts` field in `package.json` is a set of verdicts, not a warning to silence, and `"fsevents": false` / `"vue-demi": false` in particular read as oversights. They are not: fsevents ships a prebuilt `.node` with no `binding.gyp`, and vue-demi's `switchVersion(3)` copies files that already ship byte-identical to `lib/v3/*` on a Vue 3 project. Only `esbuild` executes anything real, and it is pinned so the pin expires with the version. The field is JSON and cannot hold comments, so the evidence for each verdict lives in `docs/npm-install-scripts.md` — read it before changing a line. Note the trap: `allowScripts` is advisory in npm 11.x, so a wrong verdict is invisible until npm starts blocking. A green build never validates a denial. See #707.
- **Native `<select>` is kept for small fixed option sets** — sort order, 3–5 choices that never change. It is not a styling oversight: one unlayered `select:not([multiple]):not([size])` rule in `main.css` sets `appearance: none` and draws the caret, because `appearance` governs only the *closed* control, so mobile still opens the native OS picker. That, plus free keyboard typeahead and accessibility, is why it beats a custom listbox here. Reach for `EntityCombobox` when the options are dynamic, numerous, or need search — not because a `<select>` looked wrong on macOS. See #561/#620.
- **The standing security-advisor baseline is 95 findings, last measured against production 28 Aug 2026 (was 87 on 12 Aug, 95 on 23 Aug); the audit behind it was 9 Aug 2026 — not merely inherited.** The 28 Aug measurement actually returned **96**; it is 95 again because that reading found a real leak, fixed in `20260828202800` — see the `security_definer_view` bullet below before trusting the number. Treat that number as the line: a new finding is a regression, but the 95 are not a backlog to "clean up". Note the breakdown below sums to the total — an earlier revision of this line said 92 over a breakdown summing to 90, which is how a baseline stops being checkable. They are, in full:
  - **85 `*_security_definer_function_executable` (80 authenticated + 5 anon).** The advisor flags *every* `SECURITY DEFINER` function PostgREST can reach. In an app whose entire write path is RPCs, that is the expected shape, not a defect — the question that matters is whether each one authorizes internally, and every one does, via `auth.uid()`, a `private.*` helper, or the `auth.jwt() -> 'app_metadata' ->> 'role'` admin check. Five are deliberately anon-reachable: `validate_app_invite` (runs before login by definition — the token is the credential) and the four `get_library_*_sources` (shared content, intentionally not account-gated). That set of five is pinned by `supabase/tests/anon_rpc_surface.test.sql`, so a sixth cannot arrive by accident — which is how the three in #650 arrived, via the `PUBLIC` default rather than any explicit grant. If you add one on purpose, add it to the test and say why there. Three of them arrived with #642 (`20260809214703`): `admin_set_user_plan`, `admin_set_user_suspended` and `admin_grant_credits`, each gated on `private.is_app_admin()`. They exist *because* of a security requirement rather than in spite of one — they replaced direct client table writes, so the audit entry cannot be skipped — which is the shape to expect whenever a privileged action stops being a PostgREST call. **Where the extra ten since the audit came from:** the quest-runtime RPCs of `20260810*` (`get_quest_runtime_context`, `transition_quest_runtime`, `improvise_quest_runtime`, `convert_quest_to_flow` and their siblings), the two DSR writers of #643, and `admin_remove_waitlist_email` from #638. Three more landed with the campaign session (#758): `start_campaign_session` and `end_campaign_session` in `20260822234841`, both gated on `coalesce(private.is_campaign_dm(...), false)`, and `get_player_session_state` in `20260823212755` — the players' projection, gated on `private.is_campaign_member` and returning strictly less than the row. All three revoked from `anon`. The five before them came from the per-quest runtime cursor (#755) and quest status promotion (#756). Three more landed with `20260814221409` (durable characters): `attach_party_member_to_campaign`, `detach_party_member_from_campaign` and `clone_party_member`, each re-deriving identity from `auth.uid()` first — verified during the 19 Aug 2026 document-items audit, which itself added zero (its helper lives in `private`, its trigger functions are revoked). Each is a write path that moved from client table access into a gated RPC, which is the direction that grows this count on purpose. Note the shape of the number: it rises with ordinary feature work, so a **rising** count is not by itself the regression signal — a name you cannot account for is.
  - **9 `rls_enabled_no_policy` (INFO)** — the eight `*_embeddings` tables plus `disposable_email_domains`. RLS on with *no* policy is deny-all to `anon`/`authenticated`; these are read only through `SECURITY DEFINER` RPCs and written only by edge functions, so the absence of policies is the lockdown, not an oversight. Adding policies here would *widen* access.
  - **1 `extension_in_public`** — `pg_net`, used by cron/webhooks. Relocating it is a real migration with real blast radius, not a tidy-up.
  - **0 `security_definer_view` — and this category was missing from the list until 28 Aug 2026, which is the second time that has happened.** Re-measuring returned **96** against a documented 95. The extra one was `public.ai_generation_costs`, an ERROR-level finding in a category this section had never mentioned, exactly as `function_search_path_mutable` was missing before 23 Aug.

    It was not cosmetic. A view without `security_invoker` executes as its owner (`postgres`), and RLS is evaluated against the *executing* role — so the view returned the whole of `ai_credit_ledger` no matter who asked, and `select` was granted to `anon` as well. Measured before the fix: the ledger held 4 distinct users; an ordinary user reading the table saw only their own 94 rows, while the same user reading the view saw 3 distinct users' rows — **and so did `anon`, with no login**. Per row that is user_id, spend, model, provider, token counts and timestamps: the `get_user_ledger` leak again, but unauthenticated.

    Fixed in `20260828202800` by `alter view … set (security_invoker = true)` plus narrowed grants, which needed no application change — `ai_credit_ledger` already carried both `auth.uid() = user_id` and `private.is_app_admin()` policies, so invoker semantics alone give the DM their own usage, the admin everyone's, and `anon` nothing. `supabase/tests/view_security_invoker.test.sql` now asserts structurally that **no** view in `public`/`private` bypasses RLS, for the same reason the search_path test covers every function rather than the important ones.

    The lesson is now twice-learned, so state it plainly: **when you re-measure, diff the composition, not the total** — and treat a category you have never seen before as the most likely place for a real finding to be hiding, because nobody has been looking there. Neither miss was caught by the `is_app_admin()` audit or by `admin_authorization_guards.test.sql`: those inspect function bodies, and a view has none.

  **A whole finding category was missing from this list until 23 Aug 2026, and that is the lesson.** Re-measuring returned 92 against a documented 87. Three of the five were ordinary growth in the definer count (the quest-runtime work of #755), which this section already predicts. The other two were `function_search_path_mutable` — a category that had never appeared here at all, on `items_touch_content_updated_at` and `guard_item_entry_anchors`, both shipped by `20260819231506`. Nothing failed when they landed: the functions worked, the tests passed, and the finding existed only in a report someone had to remember to read. Neither was exploitable — both are `SECURITY INVOKER`, so a caller who repoints `search_path` attacks only themselves, which is why the advisor rates them WARN — but a documented baseline that omits a category is worse than no baseline, because the next reader compares against it and concludes nothing changed.

  Fixed in `20260822233613`, along with two more the advisor never reports because it only inspects `public`: `private.is_third_party_column` and `private.is_withheld_column`. `supabase/tests/function_search_path.test.sql` now asserts that **every** function in `public` and `private` pins its `search_path`, extension-owned ones excepted. Deliberately every function rather than every definer function: the dangerous case is a definer, but "no function has a mutable search_path" is a property a query can check, while "no important one does" is a judgement call re-made per review — and that is the kind of rule that decays back into this paragraph.

  So when you re-measure and the number has moved, **compare the composition, not just the total.** After the #755/#756 migrations apply the total returns to 92 — 77 authenticated definer functions (the two new client-callable quest RPCs) plus 5 anon, 9 RLS, 1 extension, and zero `function_search_path_mutable`. Same number, different shape.

  When auditing this yourself, note that grep-style checks for authorization produce false positives in both directions: the codebase uses four different idioms (`auth.uid()`, `auth.jwt()`, `private.*`, `is_app_admin()`), and a function with none of them visible may still be gated inside a `private.*` helper it calls. Read the body before reporting a hole. #650 (three RPCs granted to `anon` via the `PUBLIC` default) was the only finding that audit produced.

  **It missed one, and the miss is instructive (found 9 Aug 2026, during #641).** The audit checked that an authorization idiom was *present*, which every function passed. It did not check that the predicate could ever return false: `private.is_app_admin()` answered NULL for ordinary users, so five `SECURITY DEFINER` functions guarded by `if not private.is_app_admin()` never raised at all — `get_user_ledger` among them, leaking another account's billing history to any authenticated caller. See item 3 under the `SECURITY DEFINER` rules above. Treat "the function has an admin check" as the start of the question, not the answer: the advisor cannot see this class of bug, and neither can grep.

- **Transient searches stay out of `useUiStore`, and that is not a Filter State Pattern violation.** The pattern governs filters *over the list on the page*. Two shapes are exempt and must not be "fixed" into the store: **dialog-scoped searches** (`NpcSetEditorModal`, `AssetInsertPanel`, `WorldBundleTab`), where a modal reopening with a stale query is the bug rather than the feature; and **add-pickers that empty themselves on select** — `StoreInventory`'s "Add item to inventory…" box filters a dropdown of items to *add*, and `addItem()` clears it, so persisting it would reopen the panel with a stale query and a poised dropdown. Same for the picker primitives (`EntityCombobox`, `TagPickerInput`, `GlobalSearch`).

  The test is what the box filters: **the list already on screen → store; a popup of candidates → local `ref`.** A variable named `search` proves nothing either way — #723 listed `StoreInventory` as a violation on the strength of the name, and it was the one entry on that list that turned out not to be a list filter at all.

- **Saving on desktop returns to `/npcs/:id` and `/monsters/:id`, and that is not a Post-Mutation Navigation violation.** The rule says never navigate to the resource's own detail page, because that page is not the list and so is not confirmation. Those two paths stopped being that page: each is a **child route of its list**, so on tablet and up it mounts the grid with the sheet as a modal over it. Landing there *is* landing on the list — with the saved record on show, which is strictly better feedback than the bare grid. Below `md` there is no modal and the same path is a full-screen takeover, so both editors send phones to the plain list; that branch is the rule applying normally, not an inconsistency to tidy away.

  The test is the nesting, not the URL shape: a detail route may target its own id after a mutation **only** when it is nested under its list and the list stays mounted underneath. A standalone detail route must still go to the list. Delete still goes to the list at every width — there is no record left to confirm. See `context/features/npcs.md`, `context/features/combat-encounters.md` and `useDetailModal`.

- **Supabase "unused index" advisor hits are a known false positive here.** The stats window spans ~7.5 months and 16.1M scans, and the largest table holding a zero-scan index is small enough that Postgres prefers a sequential scan regardless. Do not drop indexes on the advisor's say-so — check the table size and query shape first.

## Brand Marks — third-party logos are not glyphs

A logo is not an icon. `src/lib/icons.ts` routes everything through `glyph()`,
which repaints the art in `currentColor` so it tints with the surrounding text.
Do that to someone else's mark and you have recoloured it, which its guidelines
almost certainly forbid — Spotify's ask for their green specifically. That is a
legal question, not a styling one.

So brand marks live apart:

- **Source of truth:** the vendor's official SVG, dropped into
  `src/assets/brands/<name>.svg` and **never edited** — not recoloured, not
  re-viewBoxed, not "optimized".
- **Rendered by:** `src/components/brand/BrandIcon.vue`, as an `<img>`. The
  browser draws the file exactly as shipped, so no stylesheet can reach inside
  and repaint a path. Each file is well under Vite's 4KB inline limit, so it
  still becomes a build-time data URI — no extra request.
- **Never `v-html`.** It was the first thing tried here and it is the wrong tool:
  a permanent injection vector bought nothing an `<img>` does not already give.

Scaling is fine and expected — a logo has to sit at the same weight as the label
beside it. Size it with utility classes (`h-4 w-4`) like any other icon. What is
not fine is recolouring it, distorting it, or scaling the axes independently.

Because `BrandIcon` takes a `name` prop it cannot go through `AppButton`'s
`:icon`; use the `#icon` slot. That is one of the documented legitimate slot
cases, not a workaround.

## Motion — panels animate through `src/lib/motion.ts`

Every animation that opens or closes a panel goes through this module. Not a
style preference: the same twelve-line transform had been hand-written into
`AppModal` and `ImageLightbox`, and `prefersReducedMotion` into four components,
each identical and each free to drift. A set of animations meant to read as one
system is exactly the thing that must not be re-derived per call site.

| You want                                    | Use                                                        |
| ------------------------------------------- | ---------------------------------------------------------- |
| A panel to grow out of the thing clicked    | `originTransform(origin, panelRect)` → `REST_TRANSFORM`     |
| A block to open to its content's height     | `<Transition v-bind="drawerTransition()">` over a `v-show`  |
| To honour the OS reduce-motion setting      | `prefersReducedMotion()` / `canAnimate(el)`                 |
| To tell Vue a JS transition finished        | `whenSettled(animation, done)`                              |

Three things that are easy to get wrong and are already handled:

- **`whenSettled` is not optional.** A cancelled animation *rejects*; uncaught,
  Vue never hears the transition ended and leaves the element mid-flight.
- **A drawer collapses its padding and borders, not just its height.** Left at
  rest, a padded drawer shuts onto a stub of empty card and an accordion's header
  rule hangs over nothing. `scrollHeight` also excludes borders, so a bordered
  drawer measured naively opens a hairline short and clips its own last row.
- **Distance wants duration.** A short hop is 260ms (`AppModal`); the soundboard
  widget crosses ~640px and needed 340ms, and `ImageLightbox` 380ms — below that
  the eye registers that something changed without seeing it travel, which
  defeats the point of animating it at all.

Reach for `canAnimate` before `el.animate`: Web Animations is absent in the test
DOM, so an unguarded animation makes a component untestable rather than merely
unanimated.

## Shared-Content Naming — say `library`, never `srd`

The shared/admin-provided content tables are `library_monsters`, `library_spells`, `library_items`, `library_species`, `library_rules`, plus the art tables `library_monster_art{,_canonical}`, `library_spell_art{,_canonical}`, `library_art_staging` and `library_art_defaults`.

**Do not call any of this "SRD."** Only ~660 of 3,541 `library_monsters` rows are WotC SRD. The rest is Kobold Press (OGL 1.0a; Black Flag under ORC) and EN Publishing. Labelling another publisher's book "SRD" misdescribes its licence — that is what #567 and #583 fixed. Name new shared-content tables, columns, RPCs, composables and types `library_*` / `Library*`. Per-source truth (title, publisher, licence) lives in `content_sources`, never in a name.

Three things still legitimately say "srd", and none of them is a mistake to fix:

- **Row ids** — `srd_owlbear`, `srd_srd_2024_owlbear`, minted by `stableSrdId()`. #583 left these alone on purpose; re-keying them means remapping twelve referrer columns, five of them jsonb.
- **The `srd/` storage prefix** and the storage policies keyed on it (see below).
- **Genuine SRD references** — the `'srd-2014'` / `'srd-2024'` `content_sources` keys, `srdConditions2014/2024`, and Open5e's own upstream keys in `source_document_key` / `source_record_key` / `library_rules.slug`. Those are foreign identifiers; rewriting them corrupts the join to Open5e.

**Adding a text-id reference to shared content?** It cannot be an FK (shared ids are text, user ids are uuid), so add a check for it to `supabase/checks/content_integrity.sql` in the same migration. That file gates production deploys, and it is the only thing standing between an id transition and another silent "Unknown creature" outage.

## Storage Path Convention — Shared vs. Private Entities

Images for entities that are **shared/canonical** (SRD content managed by admin) and **private** (user-created content) live under different prefixes in the same bucket. Mixing them up risks wiping all canonical art when clearing a user's files, or exposing a user's private art to everyone.

| Entity type                         | Storage prefix | `is_canonical` | Example path                          |
| ----------------------------------- | -------------- | -------------- | ------------------------------------- |
| Canonical/SRD (admin-managed)       | `srd/`         | `true`         | `monster-images/srd/{uuid}.webp`      |
| DM personal override of SRD content | `{userId}/`    | `false`        | `monster-images/{userId}/{uuid}.webp` |
| User-created private entity         | `{userId}/`    | n/a            | `monster-images/{userId}/{uuid}.webp` |

A DM can replace a canonical SRD image with their own — that override lives in `library_monster_art` / `library_spell_art` under their `user_id` with `is_canonical: false`. It does **not** touch the `srd/` canonical file and does not affect other users.

**Note on the `srd/` storage prefix.** #583 renamed the shared-content tables from `srd_*` to `library_*` but deliberately left this storage prefix — and the storage policies keyed on it — alone: 1,193 objects across three buckets, 1,073 art-row `image_url`s, and public URLs already handed out. The mismatch between `library_*` tables and `srd/` folders is intentional. Do not "align" them without a migration that also moves the objects and rewrites the URLs.

**Rules:**

- Admin canonical uploads → `folderPrefix: "srd"`, `is_canonical: true`. Use the admin panel only.
- DM overrides of SRD content → default `{userId}/` folder, `is_canonical: false`. Never write to `srd/`.
- User-created entities → default `{userId}/` folder, no art table override needed.
- Every bucket that holds canonical art needs a storage policy for the `srd/` prefix gated on `is_app_admin()`. See migrations `20260514000003` (monster-images) and `20260514000004` (spell-images) as the reference pattern.
- Never store canonical art under a user UUID — if that account changes, every canonical URL in the DB breaks.
- When adding a new entity type that will have SRD defaults and user overrides, add the `srd/` storage policy to its bucket in the same migration that creates the entity table.

## Module Placement — where a new logic module goes

`src/lib/` is for genuinely cross-cutting infrastructure: `supabase`, `storage`, `utils`, `nav`, `icons`, `themes`, `hotkeys`, `sanitizeHtml`, `pricing`. If a module serves **one** feature, it does not go there.

| What it is                                            | Where it goes        |
| ----------------------------------------------------- | -------------------- |
| 5e rules computation (AC, HP, DCs, slots, attacks)    | `src/rules/`         |
| Logic owned by one feature                            | `src/lib/<feature>/` |
| A multi-module subsystem, however many callers it has | `src/lib/<name>/`    |
| Static data tables with no logic                      | `src/data/`          |
| A lone utility used by three or more features         | `src/lib/` root      |

Existing folders: `lib/audio/` (+ `audio/providers/`), `lib/battlemap/`, `lib/campaignLiveSync/`, `lib/dice/`, `lib/downtime/`, `lib/illuminate/`, `lib/library/` (Open5e import + shared-content identity), `lib/scriptorium/`, `lib/tiptap/`. Top-level `src/cartographer/` is the tile-pack **authoring** tool and is separate from `lib/battlemap/`, which is the live **encounter runner** — do not merge them.

**Consumer count decides root vs folder only for single modules.** `dice/` has a folder despite `dice.ts` having 45+ consumers, because `dice` + `roller` + `diceAudio` wire into each other and form a subsystem with its own boundary — same as `tiptap/`. `supabase`, `storage` and `utils` stay in root because each is one module with no internal structure that everything happens to call. Popularity is not the test; internal cohesion is.

**Name the folder after the consumer, not the vocabulary.** `lib/` grew to 136 flat modules because each one looked cross-cutting in isolation. Several were misfiled by name alone: `edgeTreatment` is photo edges (Illuminate), not map edges; `sceneGenerators` is an ambient soundscape, not a map scene; `staleChunkRecovery` is a service worker, not audio; `npcEncounterSync` is a pure encounter-state function, not realtime transport. Before placing a module, check who actually imports it (`rg "lib/<name>\"" src/`) rather than what it sounds like.

**Never group by shape.** `senses`, `movement`, `damageIcons`, `monsterDisplay`, `npcDisplay`, `partyMemberDisplay` and `classChoices` are all "presentation parsers" and all stayed in root. They serve four different features; a `lib/statblock/` holding them would be a folder named after what they resemble rather than who uses them, which is the same error as the misnamed modules above.

**Root must not import from a feature folder.** `craftingGlyphs.generated` is owned by crafting but stayed in root, because it reaches crafting only via re-export through `icons.ts` — moving it would make a 378-consumer root module depend on `lib/crafting/` and pull that folder into every bundle touching icons. When ownership and dependency direction disagree, dependency direction wins.

### Composables — the folder is the domain the composable is *about*

`src/composables/` is subdivided the same way, into 30 domain folders mirroring the
names already used by `src/components/`. But the placement test is **not** the one
above, and reaching for the `lib/` rule here gives the wrong answer:

> A composable lives in the folder of the **domain it is about**. If it is about no
> domain — a UI or platform primitive — it stays at the root.

The difference matters because most composables are entity data-access wrappers
(113 of 196 wrap TanStack Query), and those are read by *everything*: `useParty` has
79 references across 22 areas, `useNpcs` 53 across 16. "Name it after the consumer"
therefore returns "the consumer is everyone" and pushes every entity composable back
to the root — which is precisely the 225-file flat bucket this replaced. `useQuests`
belongs in `quests/` because it is *about* quests, however many features read it.
Popularity is not the test here either; it is just a different non-test.

The 19 modules that stay at the root are the ones with genuinely no domain:
`useConfirm`, `useToast`, `useBreakpoint`, `useHotkeys`, `useInfiniteScroll`,
`useScrollRestore`, `useLazyMount`, `useDetailModal`, `useAnchoredPopover`,
`useModeSwitch`, `useTheme`, `useGlobalSearch`, `useScreenShake`, `useLocalePrefs`,
the PWA trio (`useAppUpdate`, `usePwaInstall`, `usePullToRefresh`) and the image pair
(`useImageUpload`, `usePendingImageResolver`). Adding a 20th is a
claim that the thing has no domain — check that claim before you make it.

A small folder is fine. `locations/`, `deities/` and `crafting/` hold one module each,
because a first-class domain having a home is worth more than the folder count; the
next one that arrives has an obvious place to go. Do **not** add `index.ts` barrels —
the repo has 8 of them on purpose and this directory has none.

Tests are colocated next to the module they cover — never a `__tests__/` directory.

## Component Granularity

**The shared control primitives are catalogued at `/dev/components`** (dev-only route, stripped from production). It renders every variant and size of `AppButton`, `SegmentedControl`, `AppSelect`, `AppInput` and the two action-row wrappers, in any theme via `?theme=<id>`.

Add a variant or size and you must add it to `BUTTON_VARIANTS` / `BUTTON_SIZES` in `appButtonVariants.ts` — a compile-time assertion there fails otherwise, so the catalogue cannot silently omit it. Check the page at a narrow width too: label collapse is invisible to lint, typecheck and unit tests, and has regressed twice.

**CRITICAL — reach for the primitive, never hand-roll the control:**

A new `<button class="px-2 py-0.5 border rounded …">` or `<input class="bg-muted border border-border rounded-md …">` is not a small local styling choice — it is a 263rd copy of a recipe that `AppButton` / `AppInput` / `AppSelect` already own, and it will drift. This keeps regressing because each site looks harmless on its own; #561 and #621 exist precisely because 410 buttons and ~34 fields had each made that call independently.

| You are about to write                                | Use instead                                 |
| ----------------------------------------------------- | ------------------------------------------- |
| `<button>` with any padding/border/radius/hover class | `AppButton` — variant + size, never classes |
| `<input>` with the field recipe                       | `AppInput` — tone + size                    |
| `<select>` with chrome (small fixed option set)       | `AppSelect`; dynamic/searchable → `EntityCombobox` |
| `<input type="checkbox">` — any, labelled or not      | `AppCheckbox` — size + labelRole + accent (#751) |
| A coloured pill whose colour means something          | `AppButton variant="tinted"` + `tone` + `emphasis` |
| A toggle/segmented picker                             | `AppButton :active` or `SegmentedControl`   |

Every variant is rendered at `/dev/components` — open it rather than guessing which one matches. If none does, add a variant to `appButtonVariants.ts` / `fieldVariants.ts` / `checkboxVariants.ts` (the compile-time assertion forces it into the catalogue); do **not** fall back to a class string. A raw `<button>`/`<input>` is fine only when it carries *no* chrome — a bare word of clickable text, or a radio/file input. Checkboxes are **not** in that exception: the original carve-out assumed a checkbox carries no chrome, and measurement (#751, 21 Aug 2026) found 100 of them in twelve visual states — they route through `AppCheckbox`, whose one deliberate raw survivor (the `sr-only` travel chip in `EventModalTravelFields`) is named in its docstring.

`cn()` registers the #552 typography roles in tailwind-merge's `font-size` group, so a call-site `class="text-caption"` genuinely overrides a variant's `text-label-lg`. Overriding one token on a primitive is expected; re-declaring the whole box is not.

**CRITICAL — extract shared UI, never duplicate it:**

If two pieces of UI share structure and differ only in a few values, the structure becomes a component and the diff becomes props. Identify this *before* writing a second copy, not after.

- A list row with an image and action buttons → component
- A staging card with preview + search + checkboxes → component
- A collapsible panel with tabs → component

**Hard rules:**

- Template >300 lines is a signal to split, not a sign of completeness
- **Soft file max: 600 lines total.** If a file exceeds 600 lines, evaluate whether splitting is warranted before adding more code. If the file is already over 600 lines and you are about to add non-trivial code, propose a split first. Exceptions: pure data files (`src/data/*.ts`), generated types, and files where the size is intrinsic to the domain (e.g. a canvas renderer that cannot be meaningfully split). Always call out the exception explicitly.
- If two files share >30% of their markup, the shared part belongs in a component
- The parent (page/panel) wires data and config; the child owns layout and interaction
- Never create two half-baked copies that will silently diverge — one component with props beats two files every time
- Extract the shared part now, not "when we do the next one" — see [Leave the Plate Clean](#leave-the-plate-clean--read-this-before-you-report-anything-as-done)

## Filter State Pattern

Any list view with filters **must** store its state in `useUiStore` (`src/stores/ui.ts`) — not in local `ref`s, not in `useLocalStorage`. This ensures filters survive navigation within a session without permanently polluting localStorage.

**Required for every filter set:**

1. Add state refs + a `hasActiveFilters` computed + a `reset*Filters()` function to `useUiStore`
2. Wire the view/component to the store via writable `computed` getters/setters
3. Show a **Clear** button (visible only when `hasActiveFilters` is true) that calls `reset*Filters()`
