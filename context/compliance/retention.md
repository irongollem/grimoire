# Retention — Register

The answer to "how long does Grimoire keep this, and what makes that true?" for
every category of data it holds. GDPR Art. 5(1)(e), issue #639, decided
10 Aug 2026. Companion to `context/compliance/data-subject-rights.md`, which
covers what happens when someone asks for their data *back* or *gone*; this file
covers what happens when nobody asks at all.

**Why this file exists.** Retention is the one obligation with no user on the
other end of it. Erasure has a request, export has a request, and both fail
loudly if the code is wrong. A retention period that was never decided fails
silently and looks identical to a table nobody visits — which is precisely how
Grimoire arrived at August 2026 with two enforced periods (AI prompt text,
bug-report screenshots) and 138 tables whose answer was "nobody has thought
about it yet". An undecided period is not neutral. In practice it resolves to
*forever*.

Positions are dated because they can be revisited. **Indefinite entries are
answers, not omissions** — the point of the register is that each category has a
decided answer, not that every number is small.

## 1. The register

| Category | What it is | Period | Mechanism |
| --- | --- | --- | --- |
| Account and authored content | Profile, subscription, preferences, consents, and the ~104 tables holding campaigns, characters, NPCs, notes, art rows, memberships | **As long as the account exists** | `on delete cascade` from `auth.users` — see data-subject-rights.md §2 |
| Financial evidence | `ai_credit_ledger`, `purchase_consents` | **7 years** from the end of the financial year; anonymized earlier if the account is erased | `private.purge_expired_retention()` |
| Accountability log | `admin_audit_log` | **7 years**, same clock | `private.purge_expired_retention()` |
| Data-subject request log | `dsr_requests` | **7 years** from `received_at` — not `created_at`, which differs for the email channel | `private.purge_expired_retention()` |
| AI prompt text | `image_generation_jobs.prompt`, `ai_generation_jobs.request_json` | **90 days**, cleared in place | `scrub-stale-ai-prompt-content` (`20260804000005`) |
| AI image jobs that produced nothing | `image_generation_jobs` where `status <> 'ready'` or no image | **90 days** | `private.purge_expired_retention()` |
| AI generation job receipts | `ai_generation_jobs` | **365 days** | `private.purge_expired_retention()` |
| Support | `bug_reports` screenshot / row | **90 / 365 days** | `purge-bug-report-data` (`20260809000002`) |
| Security telemetry | `abuse_guard_trips` | **180 days** | `private.purge_expired_retention()` |
| Rate-limit counters | `rate_limit_events` | **25 hours** | `purge-rate-limit-events` (`20260621000008`) |
| Invite tokens | `app_invites`, `campaign_invites` | **90 days** after the token stops working | `private.purge_expired_retention()` |
| Product signal | `feature_interest` | **365 days** | `private.purge_expired_retention()` |
| Waitlist | `pro_waitlist` | Until the launch email is sent; **365-day** backstop | Matching account erasure + operational removal + `private.purge_expired_retention()` |
| Derived vectors | the eight `*_embeddings` tables | Lifetime of the row they describe | FK cascade from the source row |
| Shared library content | `library_*`, `sound_library`, `content_sources` | **Indefinite** | — not personal data |
| Rules catalogue and operator config | `plans`, `provider_config`, `ai_model_pricing`, the `class_*` policy tables, and the rest | **Indefinite** | — not personal data |

The classification is asserted, not just written down: `retention_periods.test.sql`
fails if a table exists in `public` that is neither reached by the erasure
cascade nor named in that test's two lists. A new table now has to be given an
answer before the suite goes green.

## 2. The numbers that are not obvious

**Seven years is measured from the end of the financial year, not from the row.**
Art. 52 AWR runs the clock from the close of the book year the transaction fell
in, so a ledger row from March 2026 is retained until 31 Dec 2033 and becomes
deletable on 1 Jan 2034 — nine months later than `created_at + 7 years` would
say. `private.retention_horizon(7)` truncates to the year and steps back, and
the pgTAP fixture is deliberately placed in the gap between the two readings, so
flattening it into an anniversary fails a test instead of deleting evidence
inside a period the law requires it to be kept.

**The far end of a retention period is an obligation too.** The seven years are
a floor set by tax law and a ceiling set by Art. 5(1)(e); until this migration
only the floor existed. `data-subject-rights.md` §5 named this as a gap in its
own words — "nothing yet *deletes* them at the end of it".

**Writing down a floor meant checking one.** "Kept for seven years" is a claim
about what *cannot* happen to a row in the meantime, and `purchase_consents` was
held back by RLS alone — SELECT-only policies over the default `ALL` grant
Supabase hands `anon`/`authenticated` on every public table. One accidental
write policy and a buyer could have deleted the record of their own consent, the
single row those seven years exist to preserve. `20260810000004` revokes the
writes on both evidence tables, the same second layer `bug_reports` was given at
birth and the older tables never got.

**180 days for `abuse_guard_trips` is a dispute window, not an operational one.**
The velocity guard reads a 24-hour window (`abuse_guard_config.window_hours`), so
the rows are operationally dead after a day. What keeps them is being able to
answer "why was my spending blocked" — from the user, or from a card issuer via a
chargeback, which Stripe allows up to 120 days after the charge.

**365 days for `feature_interest` makes the metric honest as a side effect.** The
table exists to count buy signal for unbuilt features. A click from a year ago
inflates that count with someone who has moved on, so the retention period and
the number's usefulness want the same bound. Expiring it is harmless precisely
because the click is repeatable.

**Invite expiry is measured from `expires_at` where there is one.** An invite
that was *used up* rather than timed out has no "spent at" timestamp, so it falls
back to `created_at` — an approximation, and the reason the period is 90 days
rather than something tighter. An invite with neither an expiry nor a use cap is
a standing open door and is never purged; that is a property of the invite, not
an oversight in the job. Note these rows carry a person's first name in `label`,
which is what makes them personal data at all.

## 3. Two tables that look alike and are not

`image_generation_jobs` and `ai_generation_jobs` are both "a record of an AI
generation", and they get opposite treatment.

`image_generation_jobs` **is the Gallery.** `useGalleryImages.ts` queries it
directly for `status = 'ready'` rows with an image, and that is the only place
those images are listed. A blanket period on this table would not be retention,
it would be deleting content people made and can still open. Only the rows that
produced nothing are bounded.

`ai_generation_jobs` **is a receipt.** `finalize_music_generation_job` attaches
the artifact to a `sounds` row *before* the job reaches `ready`, so the file is
already the user's content under `sounds/{userId}/ai/` and the job row points at
nothing that needs it. Deleting it at a year strands nothing — and there is no
status filter, because the stale-fail cron measures liveness in minutes, so a
row a year old is terminal whatever its `status` column says.

The lesson generalises: **whether a table is a log is a question about who reads
it, not about what its columns are called.** Check for a consumer before giving
a job/event/log table a period.

## 4. Known gaps

`pro_waitlist` has no account FK, but it is no longer an erasure gap.
`prepare_user_erasure` reads the target's email directly from `auth.users` and
deletes a case-insensitive match. The address is never accepted from the caller
or copied into the audit log. Unmatched pre-account signups remain consent-based
waitlist data with the withdrawal route and 365-day backstop above.

- **Storage objects have no period of their own.** Every retention rule above is
  a row rule. Files follow their owning row only where the row is what the app
  reads; a job row deleted at 90 days does not delete a file, which is safe today
  only because the bounded job categories are the ones that produced no file.
  Any future retention rule on a table with a storage path has to say what
  happens to the object, and `pg_cron` cannot do it in SQL — deleting a Supabase
  object needs the storage API.
- **The 7-year purges have never deleted anything.** The oldest ledger row is May
  2026, so the first real deletion is due in 2034. The horizon is covered by
  fixtures placed either side of it, which is the only evidence available until
  then; treat that test as load-bearing rather than decorative.
- **Nothing alerts if a job stops firing.** `cron.job_run_details` records
  failures and nobody reads it. A retention job that silently stopped would look
  exactly like a table that is simply growing.

## 5. Where the code lives

| Concern | File |
| --- | --- |
| The horizon, the guard exceptions, the purge, the schedule | `supabase/migrations/20260810000004_retention_periods.sql` |
| DSR request log — 7 years from receipt, and its own append-mostly guard | `supabase/migrations/20260811152817_dsr_request_log.sql` |
| Both sides of every boundary, and the "every table is classified" assertion | `supabase/tests/retention_periods.test.sql` |
| AI prompt-text scrub (90 days) | `supabase/migrations/20260804000005_ai_log_tamper_evidence.sql` |
| Bug-report screenshot and row purge (90/365) | `supabase/migrations/20260809000002_bug_report_privacy.sql` |
| Rate-limit purge (25 hours) | `supabase/migrations/20260621000008_rate_limit_events.sql` |
| The append-only guards these periods had to be let through | `supabase/migrations/20260808000001_account_deletion_erasure_path.sql` |
| What the user is promised | `src/pages/privacy.md` §5 in the `grimoire-marketing` repo |
