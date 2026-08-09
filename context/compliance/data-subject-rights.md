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
| Retention periods defined + enforced | 5(1)(e) | Partial — only the 90-day AI-prompt scrub (`20260804000005`) | #639 |
| Admin action audit log | 5(2) | Table + erasure entry shipped; other writers pending | #642 |

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

## 5. Known gaps

- **Export (#632).** No Art. 15/20 export exists. A user can erase their data but
  cannot obtain a copy of it first, which is the more commonly exercised right.
- **DSR log (#643).** Erasures are logged (`admin_audit_log`); other request types
  are not, so there is no evidence of the 30-day clock for anything but deletion.
- **Retention (#639).** Only AI prompt text has an enforced period. The 7-year
  bookkeeping retention on the evidence tables is asserted here and honoured by
  keeping the rows, but nothing yet *deletes* them at the end of it — retention is
  a maximum as well as a minimum.
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
