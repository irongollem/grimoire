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

Migration files live in `supabase/migrations/` with timestamp prefix `YYYYMMDDNNNNNN_name.sql`.

**CRITICAL — `SECURITY DEFINER` functions (avoid re-introducing the security-advisor warnings):**

A `SECURITY DEFINER` function in the `public` schema is auto-published by PostgREST as an `/rest/v1/rpc/<name>` endpoint callable by `anon`/`authenticated`. Two recurring mistakes, both flagged by `mcp__supabase__get_advisors({ type: "security" })`:

1. **RLS-helper predicates must NOT live in `public`.** Any function used inside an RLS policy (an `is_*`/`can_*`/`owns_*`-style boolean, or anything called from a `USING`/`WITH CHECK`) goes in the **`private`** schema and is referenced as `private.is_campaign_member(...)`. PostgREST does not expose `private`, but `authenticated`/`anon` keep `USAGE` + `EXECUTE` so RLS still resolves it. Do NOT try to revoke `EXECUTE` from `authenticated` to "hide" a public helper — that breaks every policy that references it (`permission denied for function`). Relocation is the only correct fix. See migration `20260629000002` and [private-schema memory] for the mechanical relocation pattern.

2. **Every client-callable `SECURITY DEFINER` RPC must authorize internally, as its first act.** Because it runs with the definer's privileges (bypassing RLS), it must re-derive identity from `auth.uid()` — never trust a caller-supplied `p_user_id`/`p_claimer_id` — and gate on `is_app_admin()` / `private.is_campaign_member(cid)` / explicit ownership before doing any work. The `grab_item_drop` bug (fixed in `20260629000002`) shipped without this and let any user act in any campaign. Mirror the sibling RPC's check; if no sibling exists, add the `auth.uid()`/membership/admin guard explicitly.

Also: trigger functions never need an `EXECUTE` grant (the trigger system bypasses the check), so `revoke execute on function public.<trigger_fn>() from public, anon, authenticated;` to keep them off the RPC surface. Login-only RPCs should `revoke execute ... from public, anon;` then `grant execute ... to authenticated, service_role;` (anon's access comes via the `PUBLIC` grant, so revoking from `anon` alone is a no-op).

**Always run `get_advisors({ type: "security" })` after any migration that adds/changes a function or policy**, and resolve new findings before pushing.

**CRITICAL — migration workflow (prevents timestamp mismatch):**

NEVER use `mcp__supabase__apply_migration` for schema changes. It auto-generates its own timestamp that will never match the local file's timestamp, causing `supabase db push` to diverge every time.

**CRITICAL — always use `/new-migration` to create migration files (prevents sequence collisions):**

NEVER pick a migration sequence number manually. Always invoke the `/new-migration` skill first to get the correct next filename — it checks both local files and `origin/main` to avoid collisions when working on branches.

Always follow this exact workflow:

1. Invoke `/new-migration <name>` — this creates the file with the correct collision-free timestamp
2. Write the SQL body into the created file
3. Apply it to the remote DB via Bash: `supabase db push`

This ensures a single timestamp (the filename) is used for both local tracking and remote history.

## Post-Mutation Navigation

After any create, save, or delete operation, always navigate back to the list view — this confirms the action succeeded.

- **Create** → `router.push('/resource-list')`
- **Save (edit)** → `router.push('/resource-list')`
- **Delete** → `router.push('/resource-list')`

Never stay on the detail/editor page or navigate to the newly created resource's detail page. The list view is the success feedback. In the case of nested resources (e.g. locations), navigate to the parent resource's detail page instead unless its the top of the hierarchy.

## Work Tracking

GitHub issues on `irongollem/grimoire` are the single source of truth for open work. When you finish something, close the corresponding issue with `mcp__github__update_issue` (`state: closed`).

There is no change log to update. The record of what shipped is the git history, and the record of *why* is a comment at the point of the decision — put it in the code, the migration, or the relevant `context/features/` doc, where the next person to touch that line will actually be standing.

## Sanctioned Exceptions

Deliberate departures from the rules above and in the feature docs. They look like oversights, get "fixed", and regress — so they are written down.

- **Native `<textarea>` for AI-prompt fields.** The ~40 model-prompt boxes (`*GeneratorPanel`, `*GenerateDialog`, `AdminPromptsTab`) stay native rather than becoming `RichTextEditor`. Rich text in a prompt box is wrong — the model receives markup as content.
- **px is kept** for borders and outlines, box/text/drop shadows, `@media` / `@container` breakpoints, `9999px` pills, hairline dividers, and SVG user-space `<text>`. Everything else is rem. These are the cases where a rem value scales into a visual bug.
- **Crafting has no toast, on purpose.** `CraftAttemptDialog` already surfaces errors inline via `attemptError`; a toast would double up. An absence cannot self-document, hence this line.
- **Native `<select>` is kept for small fixed option sets** — sort order, 3–5 choices that never change. It is not a styling oversight: one unlayered `select:not([multiple]):not([size])` rule in `main.css` sets `appearance: none` and draws the caret, because `appearance` governs only the *closed* control, so mobile still opens the native OS picker. That, plus free keyboard typeahead and accessibility, is why it beats a custom listbox here. Reach for `EntityCombobox` when the options are dynamic, numerous, or need search — not because a `<select>` looked wrong on macOS. See #561/#620.
- **The standing security-advisor baseline is 74 findings, and they were audited on 9 Aug 2026 — not merely inherited.** Treat that number as the line: a new finding is a regression, but the 74 are not a backlog to "clean up". They are, in full:
  - **64 `*_security_definer_function_executable` (59 authenticated + 5 anon).** The advisor flags *every* `SECURITY DEFINER` function PostgREST can reach. In an app whose entire write path is RPCs, that is the expected shape, not a defect — the question that matters is whether each one authorizes internally, and every one does, via `auth.uid()`, a `private.*` helper, or the `auth.jwt() -> 'app_metadata' ->> 'role'` admin check. Five are deliberately anon-reachable: `validate_app_invite` (runs before login by definition — the token is the credential) and the four `get_library_*_sources` (shared content, intentionally not account-gated).
  - **9 `rls_enabled_no_policy` (INFO)** — the eight `*_embeddings` tables plus `disposable_email_domains`. RLS on with *no* policy is deny-all to `anon`/`authenticated`; these are read only through `SECURITY DEFINER` RPCs and written only by edge functions, so the absence of policies is the lockdown, not an oversight. Adding policies here would *widen* access.
  - **1 `extension_in_public`** — `pg_net`, used by cron/webhooks. Relocating it is a real migration with real blast radius, not a tidy-up.

  When auditing this yourself, note that grep-style checks for authorization produce false positives in both directions: the codebase uses four different idioms (`auth.uid()`, `auth.jwt()`, `private.*`, `is_app_admin()`), and a function with none of them visible may still be gated inside a `private.*` helper it calls. Read the body before reporting a hole. #650 (three RPCs granted to `anon` via the `PUBLIC` default) was the only real finding the audit produced.

- **Supabase "unused index" advisor hits are a known false positive here.** The stats window spans ~7.5 months and 16.1M scans, and the largest table holding a zero-scan index is small enough that Postgres prefers a sequential scan regardless. Do not drop indexes on the advisor's say-so — check the table size and query shape first.

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
| A coloured pill whose colour means something          | `AppButton variant="tinted"` + `tone` + `emphasis` |
| A toggle/segmented picker                             | `AppButton :active` or `SegmentedControl`   |

Every variant is rendered at `/dev/components` — open it rather than guessing which one matches. If none does, add a variant to `appButtonVariants.ts` / `fieldVariants.ts` (the compile-time assertion forces it into the catalogue); do **not** fall back to a class string. A raw `<button>`/`<input>` is fine only when it carries *no* chrome — a bare word of clickable text, or a checkbox/radio/file input.

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
