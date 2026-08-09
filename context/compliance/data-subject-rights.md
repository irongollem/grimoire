# Data Subject Rights — Register

Legal/compliance register for the rights machinery under EPIC #646 (GDPR review,
August 2026): erasure, export, withdrawal, and the retention periods behind them.
Companion to `context/compliance/ai-act.md`, which covers the AI Act rather than
the GDPR, and follows the same convention — positions are dated because they can
be revisited, and nothing here is assumed permanent.

**Why this file exists rather than the epic.** #646 carries the *plan* and gets
closed when the plan is done. This file carries the *contract* — what the system
promises to do with personal data and which invariants must hold for that promise
to stay true — which outlives every ticket in it. Mechanism lives at the point of
decision (migration `20260808000001` is heavily commented and is the authority on
the SQL); this file is the map across those points, and the place a reader lands
when they ask "what happens to X when an account is erased?"

## 1. Status

| Right | Article | State | Ticket |
| --- | --- | --- | --- |
| Erasure | 17 | **Shipped** (Aug 2026) | #631 |
| Access / portability | 15, 20 | Not built | #632 |
| DSR request log (30-day clock evidence) | 12(3) | Not built | #643 |
| Retention periods defined + enforced | 5(1)(e) | **Shipped** (Aug 2026) — register in `context/compliance/retention.md` | #639 |
| Admin action audit log | 5(2) | **Shipped** (Aug 2026) — see §4d | #642 |

The privacy policy §5 promises deletion within 30 days. The implementation is
**immediate and synchronous**, so the promise is satisfied with margin; if that
ever becomes asynchronous, §5 becomes the binding deadline and needs a queue with
evidence of completion.

## 2. The erasure contract

Erasure is not "delete every row that mentions the user". Four categories, four
different fates, and the distinction is deliberate:

| Category | Fate | Why |
| --- | --- | --- |
| Everything the user authored or owns — campaigns, characters, notes, art rows, memberships | **Deleted** by `on delete cascade` from `auth.users` | Personal data with no retention basis |
| `ai_credit_ledger`, `purchase_consents` | **Retained, anonymized** — `user_id` → null, `anonymized_at` stamped | Art. 17(3)(b): retention required for a legal obligation. Dutch bookkeeping law (art. 52 AWR) requires 7 years, and these rows are the dispute evidence for real money |
| `rate_limit_events`, `storage.objects.owner`/`owner_id` | **Deleted / nulled** explicitly by `prepare_user_erasure` | No FK to `auth.users`, so no cascade reaches them |
| Storage objects under `{userId}/` in every Supabase bucket and every R2 bucket | **Deleted** before anything else | See ordering below |

**Anonymized ≠ deleted, and that is the point.** A retained ledger row keeps its
amounts, reasons and timestamps — its evidentiary value — and loses only the link
to a person. `anonymized_at` records *that this happened and when*, which is what
makes the retention defensible: an auditor sees an erased row, not an
unattributable one.

The seven years now have a far end as well as a near one: `20260810000004` gives
both evidence tables a purge at the close of the financial year plus seven, via
the only sanctioned exception the append-only guards have ever been given. See
`context/compliance/retention.md` §2 for why the boundary is the year end rather
than the row's anniversary.

**What is deliberately not kept:** no email, no display name, no IP. The only
identifier surviving erasure is the raw uuid on the `admin_audit_log` entry, kept
as the receipt that the request was honoured. It links to nothing — every row that
referenced it has been nulled — so it is not a re-identification route.

## 3. Order of operations, and why it is not negotiable

`supabase/functions/delete-account/index.ts`:

1. **Authorize** — self-serve (caller deletes self) or admin (`requireAdmin`).
   Accounts with `app_metadata.role === "admin"` are refused; de-privilege first.
2. **Confirm** — `confirm: "DELETE"` gate.
3. **Purge storage in both stores** — every Supabase bucket via recursive listing
   (`list()` is one level deep and paginates at 100, both handled in
   `_shared/storage-purge.ts`), and every R2 bucket by prefix. The whole request
   fails if any bucket fails.
4. **`prepare_user_erasure(p_user_id, p_actor_id, p_actor_kind)`** — writes the
   audit entry, then clears the rows no cascade reaches.
5. **`auth.admin.deleteUser`** — the cascades and set-nulls do the rest.

Storage is purged **first** because an object whose owner no longer exists cannot
be found by any per-user listing path again: a partial purge would strand files
that are unreachable and undeletable forever. A half-purged account is therefore
never deleted — the request fails and can be retried.

The audit entry is written **before** the destructive work, so that a failure
unwinds the transaction and leaves no misleading record of an erasure that did not
complete.

## 4. Invariants — break these and erasure silently breaks

Each of these has already cost a bug once. They are enforced by pgTAP in
`supabase/tests/ai_compliance_regressions.test.sql`.

1. **No FK to `auth.users` in `public` without `cascade` or `set null`.** Migration
   `20260808000001` asserts this at push time, so a migration that would re-block
   deletion fails its own deploy instead of failing at the next erasure request.
2. **An append-only guard must sanction the referential action that crosses it.**
   This has bitten twice. The ledger's UPDATE guard must allow `user_id` → null;
   `admin_audit_log`'s must allow `admin_user_id` → null, because
   `admin_user_id` is `on delete set null` and a *self-serve* erasure updates the
   entry written moments earlier in the same transaction. An unconditional guard
   makes self-serve deletion fail outright.
3. **Do not reintroduce the "parent absent" DELETE exemption** from
   `20260804000009`. With the FK now `set null`, `user_id is null` means "erased",
   so that exemption would make every anonymized evidence row freely deletable —
   the opposite of what it is retained for.
4. **A row is attributable or anonymized, never neither.** The CHECK constraints
   on both evidence tables. Without them, dropping `NOT NULL` would let a stray
   insert mint a row indistinguishable from erased evidence.
5. **The actor is derived from the verified JWT**, never from the request body —
   otherwise an admin could file their own deletion as the user's request.
   `prepare_user_erasure` additionally refuses `actor_kind = 'self'` unless the
   actor really is the target.

## 4a. Publication — the boundary erasure cannot reach

Erasure controls what the system *holds*. It has no reach over what the system
has already *published*, and the in-app bug reporter published to
`irongollem/grimoire`, which is a public repo. Two leaks, both closed 9 Aug 2026
by `20260809000002`:

- **The reporter's identity in the issue footer (#633).** Built client-side as
  `display_name || email`, so an account with no campaign display name — a new
  one — would have put an email address on the open internet. Audited: none of
  the 15 reports filed since April hit the fallback, so nothing needs scrubbing.
- **Screenshots in a `public: true` bucket (#634), linked by permanent URL from
  the issue.** Verified fetchable with no credential before the single stored
  object was deleted.

Three positions worth not re-deriving:

1. **A signed URL is not a fix when the page holding it is public.** It is only
   an expiry on the leak. Anything a maintainer needs but the world may not see
   has to leave the issue body entirely, which is why the screenshot moved onto
   `bug_reports` and the maintainer reads it from Admin → Reports.
2. **`profiles.username` is not a safe substitute for the email.** The default
   username *is* the email local-part (#636), so publishing it publishes a piece
   of the address. Attribution stays out of the issue entirely, which also makes
   this fix independent of whether #636 ever lands.
3. **Screenshots were also invisible to erasure.** They were stored at
   `bug-reports/{timestamp}-{name}` with no user prefix, and `delete-account`
   finds objects by listing each bucket's `{userId}/` folder — so a screenshot
   outlived the account that produced it. On the row, the FK cascade covers it.
   Any future user-generated file that is *not* stored under `{userId}/` has the
   same hole; the storage path is load-bearing for §3 step 3.

## 4b. Identity — the email is not a name

Closed 9 Aug 2026 by `20260809143243` (#636, #635, #637). Where §4a was about what
leaves for the open internet, this is about what other *users* see: the address
had become the app's fallback answer to "what is this person called".

Five surfaces, one defect. `profiles.username` defaulted to
`split_part(email, '@', 1)` and `profiles_select` is
`USING (auth.uid() IS NOT NULL)`, so a fragment of every address was readable by
every signed-in account — 6 of 16. `create_dm_membership()` and
`join_campaign_via_invite()` ended their display-name chain at
`auth.users.email`, putting 2 full addresses into member lists. Chat sender
names, presence and the world-bundle/PDF `author` field each independently wrote
`display_name ?? userEmail`.

Three things worth not rediscovering:

1. **Order was load-bearing, and the issues had it backwards.** #635's stated fix
   is "fall back to `profiles.username`" — but both affected members were
   accounts whose username *was* their email local-part, so applying it alone
   would have rewritten `someone@example.com` to `someone` and looked finished.
   The username had to stop being derived in the same migration, before anything
   copied it into a party-visible field.
2. **Stripping the domain is not a fix.** `CampaignChat.resolveClaimerName` did
   `dn.split('@')[0]` before rendering. That is the same laundering as (1),
   written by hand. `auth.publicName` is now the single answer to "what do others
   see me as" so there is one place to get this right; `userEmail` remains, and
   remains correct, for showing a user their *own* address.
3. **The rename of the 6 existing handles was silent, deliberately.**
   `profiles.username` is read in exactly one place on the client and rendered by
   no component, and there is no UI to change it — nobody has ever been shown
   their own username, so nobody can be attached to it. If a username editor ever
   ships, that reasoning expires and a rename needs consent.

**A related discovery, fixed in `20260809143816`:** `on_auth_user_created` and
`on_auth_user_created_subscription` existed *only in production*. Both functions
are created by migrations; the bindings were made by hand and never captured, so
a fresh database created neither a profile nor a free subscription on signup —
and no local or CI run had ever executed either function. `seed.sql` supplying
profiles as data is what hid it. Both bindings are now asserted by
`supabase/tests/identity_not_from_email.test.sql`, so deleting them fails the
suite instead of silently testing nothing.

## 4c. The local seed — the other copy erasure cannot reach

`npm run db:pull` dumps production `auth` + `public` data into
`supabase/seed.sql` so local dev has realistic content. That file is gitignored
and has never been tracked, so this was never a publication question (§4a) — it
is about **copies at rest**. A dump held 13 real addresses, and a laptop is
outside every control that applies to production: no retention period, and no
reach for `delete-account`, which cannot follow someone into a file on a
machine it has never heard of. A user who exercises Art. 17 was erased from
production and still present in every `seed.sql` ever pulled.

Fixed in `scripts/anonymize-seed.ts` (#652), which `db:pull` chains onto the
dump. Every address becomes `user-<n>@example.invalid` — RFC 2606 reserves the
TLD so it can never resolve. The reasoning worth keeping:

1. **Anonymize, do not pseudonymize.** Placeholders are assigned by order of
   first appearance, not derived from the address. A hash would be stable across
   pulls, which is convenient, and reversible by brute-force over a guessed
   address list, which makes it still personal data. The convenience is not
   worth the category change.
2. **One address maps to one placeholder across the whole file.** `auth.users.
   email`, its copies in `auth.identities.identity_data` and
   `raw_user_meta_data`, and the `campaign_members.display_name` /
   `party_members.player_name` rows that pre-date §4b all keep agreeing. That is
   not tidiness: the unique index on `auth.users.email` requires distinct
   inputs to stay distinct, and a seed whose member rows *still* demonstrate the
   §4b defect is the seed you want for reproducing it locally.
3. **One address is kept — your own.** The seeded account has to remain one you
   can sign into, so `git config user.email` survives (override with
   `SEED_KEEP_EMAILS`). Defaulting to the git identity avoids hard-coding a
   maintainer's address into a public repo to protect it from disclosure.
4. **The greedy pattern is deliberate.** It scrambles any address anywhere in
   the dump, not just the four tables holding one today. A table list stops
   covering the case where an address lands in a note body or an NPC backstory.
5. **`db:reset` re-checks before seeding.** The chained step is bypassed by
   anyone running `supabase db dump` by hand, which the README shows people
   doing, so the gate is at the point of use rather than only at the point of
   creation.

**This does not make local dumps free.** They still hold campaign content,
usernames and every non-email column. Anonymization removes the identifier that
made the file a roster of real people; delete your `seed.sql` when you stop
working on the project.

## 4d. The admin audit log — accountability for privileged actions

Art. 5(2) requires the controller to be able to *demonstrate* compliance, and the
admin powers here are all unilateral and consequential: erase an account, change
what someone pays, freeze their spending, lock them out, mint or take back
credits, refund a pack. `admin_audit_log` is the record of who did which of those
to whom, created by `20260808000001` for erasure and completed by
`20260809214703` for the rest (#642).

**The design decision that matters is where the entry is written.** Three of
these actions used to be direct table writes issued by the browser
(`user_subscriptions.update`, `ai_credit_ledger.insert`), permitted by two admin
RLS policies from `20260506000003`. A logging call added beside them in
`useAdminUsers.ts` would have produced a log the actor can decline to write, by
issuing the same PostgREST request from devtools. So each became a SECURITY
DEFINER RPC that performs the mutation **and** its entry in one transaction, and
both policies were dropped. `authenticated` now has no PostgREST path to
`plan_id`, `suspended_at`, or an `ai_credit_ledger` insert at all: the entry is
not enforced by discipline, it is enforced by there being no other way to do the
work.

The two actions that happen outside Postgres — the GoTrue ban and the Stripe
refund — log from their edge functions via `_shared/adminAudit.ts`, after the
external call succeeds. A failed log write there is reported and swallowed:
failing the request would report a false failure for a refund that has already
moved money, and invite a retry that refunds twice.

Invariants:

- **The actor is `auth.uid()` / the verified JWT, never an argument.** The
  *target* is a caller-supplied id, necessarily — an admin acts on other
  accounts — but nothing else about identity comes from the caller.
- **The log has no INSERT policy and, since `20260809214703`, no INSERT grant for
  `anon`/`authenticated`.** Every row comes from a definer function or a
  service-role edge function. UPDATE and DELETE are refused by the append-only
  guard, with the one sanctioned `admin_user_id` → null transition (§4, invariant
  2).
- **The vocabulary is pinned** by `admin_audit_log_action_check`. A new action
  means extending that constraint in the same migration as its writer, and
  adding it to `ADMIN_AUDIT_ACTIONS` in `useAdminAuditLog.ts` so the viewer can
  name it.
- **No action is logged that did not happen.** Re-freezing an already-frozen
  account writes nothing; a zero-credit grant is refused rather than recorded.
  A log read as evidence of events must not fill with non-events.
- **Identity is not denormalised into the entry.** It holds ids only, so an entry
  survives the erasure it records without carrying the erased person's email or
  name. The admin viewer resolves ids live and falls back to the bare uuid —
  which is the expected rendering for a deleted account, not a bug.

## 5. Known gaps

- **Export (#632).** No Art. 15/20 export exists. A user can erase their data but
  cannot obtain a copy of it first, which is the more commonly exercised right.
- **DSR log (#643).** `admin_audit_log` records *actions the operator took*, not
  *requests the operator received* — so a deletion is evidenced, but an access or
  portability request arriving by email leaves no trace of when the 30-day clock
  started. The two logs are not substitutes for each other.
- **The waitlist is outside erasure's reach.** `pro_waitlist` holds a bare
  address with no FK to `auth.users`, so someone who joined it, signed up, and
  later erased their account keeps an address in that table. It is bounded (365
  days, `retention.md`) and the privacy policy offers an email route, but it is
  not the automatic path every other category gets. The fix means matching on an
  identifier the erasure path deliberately does not otherwise touch, which is
  why it is its own decision rather than a line in #639.
- **Self-serve erasure is irreversible and immediate.** There is no grace period
  or soft-delete window. That is a deliberate reading of "without undue delay";
  revisit only with a decision recorded here, because a recovery window means
  retaining the data it recovers.

## 6. Where the code lives

| Concern | File |
| --- | --- |
| Schema, guards, audit table, push-time assertion | `supabase/migrations/20260808000001_account_deletion_erasure_path.sql` |
| Orchestration (authorize → purge → prepare → delete) | `supabase/functions/delete-account/index.ts` |
| Recursive storage listing | `supabase/functions/_shared/storage-purge.ts` |
| Client call + error copy | `src/composables/useAccountDeletion.ts` |
| Self-serve UI | `src/components/account/AccountSettings.vue` (route `/account`) |
| Admin UI | `src/components/admin/AdminUsersTab.vue` |
| Invariant tests | `supabase/tests/ai_compliance_regressions.test.sql` |
| Bug-report table, retention job, bucket lockdown (§4a) | `supabase/migrations/20260809000002_bug_report_privacy.sql` |
| What reaches the public issue | `supabase/functions/create-bug-report/index.ts` |
| Maintainer's view of reporter + screenshot | `src/components/admin/AdminReportsTab.vue` |
| §4a invariant tests (RLS, retention, cascade) | `supabase/tests/bug_report_privacy.test.sql` |
| Identity defaults + membership name chains (§4b) | `supabase/migrations/20260809143243_stop_deriving_identity_from_email.sql` |
| auth.users trigger bindings (§4b) | `supabase/migrations/20260809143816_capture_auth_user_triggers.sql` |
| The one answer to "what do others see me as" | `auth.publicName` in `src/stores/auth.ts` |
| §4b invariant tests | `supabase/tests/identity_not_from_email.test.sql` |
| Local-seed anonymizer + its gate (§4c) | `scripts/anonymize-seed.ts`, chained from `db:pull` and re-checked by `db:reset` |
| §4c unit tests | `scripts/anonymize-seed.test.ts` |
| Audit-log writers + the policies they replace (§4d) | `supabase/migrations/20260809214703_admin_audit_log_writers.sql` |
| Audit entries for actions outside Postgres (§4d) | `supabase/functions/_shared/adminAudit.ts` |
| Admin viewer + the pinned action vocabulary | `src/components/admin/AdminAuditTab.vue`, `src/composables/useAdminAuditLog.ts` |
| §4d invariant tests | `supabase/tests/admin_audit_writers.test.sql` |
| Retention periods — the register | `context/compliance/retention.md` |
| Retention horizon, guard exceptions, the purge, the schedule | `supabase/migrations/20260810000004_retention_periods.sql` |
| Retention invariant tests | `supabase/tests/retention_periods.test.sql` |
