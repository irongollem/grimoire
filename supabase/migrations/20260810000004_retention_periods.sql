-- Retention periods — GDPR Art. 5(1)(e), issue #639.
--
-- Before this migration exactly two categories had a period anyone could point
-- at: AI prompt text (90-day scrub, 20260804000005) and bug-report screenshots
-- and rows (90/365 days, 20260809000002). Everything else was kept "until
-- somebody thinks about it", which is not a retention policy — Art. 5(1)(e)
-- asks for a *decided* answer per category, and an undecided one always
-- resolves to "forever" in practice.
--
-- The decisions themselves, including the deliberate "indefinite while the
-- account exists" entries that need no job, live in
-- `context/compliance/retention.md`. This file is the mechanism for the
-- bounded ones. Where the two disagree, the SQL is what actually happens and
-- the doc is the bug.
--
-- One function, one cron entry. The alternative — a job per table, following
-- the fail-stale-*/purge-* precedent — would spread ten deletes across ten
-- places and make "what does Grimoire delete, and when" a grep rather than a
-- read. Retention is a policy, and a policy wants one page.

-- ── 1. The bookkeeping horizon ──────────────────────────────────────────────
-- Dutch bookkeeping retention (art. 52 AWR, the seven years the privacy policy
-- §5 already promises) runs from the end of the *financial year* in which the
-- transaction happened, not from the row's own timestamp. A row created in
-- March 2026 is retained until 31 Dec 2033 and becomes deletable on 1 Jan 2034
-- — which is what truncating to the year and stepping back seven gives:
--
--   on 2033-12-31 → 2026-01-01, so the March 2026 row is NOT yet expired
--   on 2034-01-01 → 2027-01-01, so it is
--
-- Naively subtracting seven years from now() would delete it in March 2033,
-- nine months into the period it is legally required to be kept. That is the
-- error this function exists to prevent making twice.
--
-- Pinned to UTC rather than the session's TimeZone so the boundary does not
-- move with whoever is connected — cron runs in GMT, psql may not.
create or replace function private.retention_horizon(p_years integer)
returns timestamptz
language sql
stable
as $$
  select (date_trunc('year', (now() at time zone 'UTC')) - make_interval(years => p_years))
           at time zone 'UTC';
$$;

comment on function private.retention_horizon(integer) is
  'Rows created strictly before this instant are past their p_years retention, counted from the end of the financial year (art. 52 AWR). Single definition shared by the purge and the append-only guards that sanction it.';

-- ── 2. The flag the append-only guards read ─────────────────────────────────
-- `ai_credit_ledger` and `admin_audit_log` refuse every DELETE. That is correct
-- and stays correct: the whole value of an append-only table is that nothing
-- can quietly remove a row from it. But a retention *maximum* is also an
-- obligation — data-subject-rights.md §5 flagged precisely this, that the
-- seven years are asserted and honoured at the near end and have no far end —
-- so the guards need one sanctioned exception, and it has to be narrow enough
-- that it cannot be reached by anything except the purge.
--
-- Two conditions, deliberately independent:
--
--   1. This transaction is the purge (the flag below, which only
--      private.purge_expired_retention() sets).
--   2. The row is genuinely past its horizon — re-derived inside the guard
--      from private.retention_horizon(), not taken on the purge's word.
--
-- (2) is the one that matters. If the purge's WHERE clause is ever widened by
-- mistake, the guard still refuses every row inside the window: a bug in the
-- purge becomes a failed cron run, not silently destroyed financial evidence.
--
-- `current_setting(..., true)` returns NULL for an unset key, and NULL would
-- make the comparison NULL rather than false — the exact shape that let
-- `private.is_app_admin()` fall through five authorization guards (CLAUDE.md,
-- SECURITY DEFINER item 3). Coalesced at the source so no call site can
-- repeat it.
create or replace function private.retention_purge_in_progress()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('grimoire.retention_purge', true), 'off') = 'on';
$$;

comment on function private.retention_purge_in_progress() is
  'True only inside private.purge_expired_retention(). Read by the ai_credit_ledger and admin_audit_log append-only guards to sanction the retention purge and nothing else.';

revoke execute on function private.retention_horizon(integer) from public;
revoke execute on function private.retention_purge_in_progress() from public;

-- ── 3. Widening the two guards ──────────────────────────────────────────────
-- Both bodies are otherwise byte-identical to 20260808000001. Restated in full
-- rather than patched, because `create or replace function` has no partial
-- form and a guard is the wrong place to be clever about it.
create or replace function public.ai_credit_ledger_guard_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sanctioned exception: releasing a still-pending reservation hold
  -- (reserve_credits/release_credits, the release-stale-credit-holds cron —
  -- both delete only `pending = true` rows). A settled row must never be
  -- removed, only anonymized via the SET NULL erasure path.
  if old.pending then
    return old;
  end if;

  -- Sanctioned exception: the seven-year bookkeeping retention has run out.
  -- `created_at` is nullable on this table, and a row with no timestamp can
  -- never be shown to be expired — so it is kept, which is the safe direction
  -- for evidence.
  if private.retention_purge_in_progress()
     and old.created_at is not null
     and old.created_at < private.retention_horizon(7) then
    return old;
  end if;

  raise exception 'ai_credit_ledger is append-only — settled row % cannot be deleted', old.id;
end;
$$;

revoke execute on function public.ai_credit_ledger_guard_delete() from public, anon, authenticated;

create or replace function public.admin_audit_log_guard_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sanctioned exception, and the one that is easy to miss: `admin_user_id` is
  -- ON DELETE SET NULL, so erasing the actor's own account issues an UPDATE
  -- here. For a self-serve deletion that lands on the entry written moments
  -- earlier in the same transaction, so refusing it would make self-serve
  -- erasure impossible.
  --
  -- Nested rather than one `and` chain because NEW is unassigned in a DELETE
  -- trigger and SQL does not promise to short-circuit.
  if tg_op = 'UPDATE' then
    if new.admin_user_id is null and old.admin_user_id is not null
       and (to_jsonb(new) - 'admin_user_id') = (to_jsonb(old) - 'admin_user_id') then
      return new;
    end if;
  end if;

  -- Sanctioned exception: the retention purge, at the same seven-year horizon
  -- as the evidence it accompanies. An entry records an action taken *on* an
  -- account rather than by it, so it outlives the account either way; what
  -- expires is the operator's need to be able to demonstrate the action.
  if tg_op = 'DELETE'
     and private.retention_purge_in_progress()
     and old.created_at < private.retention_horizon(7) then
    return old;
  end if;

  raise exception 'admin_audit_log is append-only — % on row % is not permitted',
    tg_op, old.id;
end;
$$;

revoke execute on function public.admin_audit_log_guard_write() from public, anon, authenticated;

-- ── 3b. The floor the register now asserts ──────────────────────────────────
-- Writing "kept for seven years" into a register is a claim about what cannot
-- happen to these rows in the meantime, so it is worth checking that nothing
-- can. All three tables are SELECT-only at the policy level and RLS is the real
-- gate — but Supabase grants ALL to anon/authenticated on every public table by
-- default, so the grants are still sitting there waiting for a stray future
-- policy, or for someone disabling RLS to debug something.
--
-- `bug_reports` got this second layer when it was created (20260809000002); the
-- evidence tables, which are older, never did. `ai_credit_ledger` at least has
-- its trigger guards behind the policy. `purchase_consents` has nothing but RLS
-- — one accidental policy and a buyer could delete the record of their own
-- consent, which is the single row the seven years exist to preserve.
--
-- Both are written exclusively by service-role edge functions
-- (stripe-create-checkout, stripe-create-credit-checkout) and by SECURITY
-- DEFINER functions, neither of which is affected by a grant to `authenticated`.
revoke insert, update, delete on public.purchase_consents from anon, authenticated;
revoke insert on public.ai_credit_ledger from anon, authenticated;

-- ── 4. The purge ────────────────────────────────────────────────────────────
-- SECURITY INVOKER, and in `private` rather than `public`, for two reasons
-- that point the same way: PostgREST publishes every `public` function as an
-- RPC (67 of the 77 standing advisor findings are exactly that), and this one
-- needs no elevated privilege — its only caller is cron, running as the table
-- owner. A definer function here would be a deletion endpoint that has to
-- defend itself; a private invoker function is not an endpoint at all.
create or replace function private.purge_expired_retention()
returns void
language plpgsql
as $$
begin
  -- Transaction-local: cron runs each statement in its own transaction, and
  -- pgTAP rolls back, so the flag cannot outlive the work it authorizes.
  perform set_config('grimoire.retention_purge', 'on', true);

  -- ── Financial evidence — 7 years from the end of the financial year ──────
  -- Retained under Art. 17(3)(b) against the erasure right, anonymized rather
  -- than deleted when the account goes (20260808000001 §1–2). This is the far
  -- end of that same period: a retention basis that has expired is no longer a
  -- basis, and an anonymized row kept past it is kept for no reason at all.
  delete from public.ai_credit_ledger
   where created_at < private.retention_horizon(7);

  delete from public.purchase_consents
   where created_at < private.retention_horizon(7);

  -- ── Accountability log — the same clock ─────────────────────────────────
  -- Art. 5(2) evidence for unilateral admin actions, several of which (refunds,
  -- credit grants, plan changes) are the counterpart to a ledger row. Splitting
  -- the two clocks would leave an entry describing a transaction whose evidence
  -- has already gone, or the reverse.
  delete from public.admin_audit_log
   where created_at < private.retention_horizon(7);

  -- ── Security telemetry — 180 days ───────────────────────────────────────
  -- The velocity guard's own window is `abuse_guard_config.window_hours`
  -- (24 by default), so these rows stop being operationally needed after a
  -- day. What keeps them longer is disputes: a user asking why their spending
  -- was blocked, or a card issuer asking the same question via a chargeback,
  -- which Stripe allows for up to 120 days. 180 covers that with margin and
  -- nothing beyond it.
  delete from public.abuse_guard_trips
   where created_at < now() - interval '180 days';

  -- ── AI image jobs — 90 days, but ONLY the ones that are logs ────────────
  -- This table is not a log. `status = 'ready'` rows with an image are the
  -- user's Gallery (useGalleryImages.ts reads exactly that predicate), so a
  -- blanket period here would silently delete content people made and can
  -- still see. Only attempts that produced nothing — failed, or stuck pending
  -- long past the 10-minute stale-fail cron — are pure record, and they carry
  -- the prompt, which is the part with the retention liability.
  --
  -- `minis.stylize_job_id` is ON DELETE SET NULL onto this table, so purging a
  -- failed stylize attempt drops a mini's pointer to it. That pointer is
  -- provenance-of-attempt, not the mini; AI provenance for the asset itself
  -- lives on the content row and in the file's XMP (provenance-architecture.md).
  delete from public.image_generation_jobs
   where created_at < now() - interval '90 days'
     and (status <> 'ready' or image_url is null);

  -- ── AI generation jobs — 365 days ───────────────────────────────────────
  -- The opposite case, and worth stating because the two tables look alike.
  -- Here the artifact is attached to a `sounds` row by
  -- finalize_music_generation_job *before* the job reaches 'ready', so the job
  -- row is a receipt and deleting it strands nothing. No status filter: the
  -- stale-fail cron measures liveness in minutes, so a row a year old is
  -- terminal whatever its status column says.
  delete from public.ai_generation_jobs
   where created_at < now() - interval '365 days';

  -- ── Spent invites — 90 days after the token stops working ───────────────
  -- An invite token is a credential while it is usable and a record of a
  -- gesture afterwards. Expiry is measured from `expires_at` where there is
  -- one; an exhausted invite has no "used up at" timestamp, so it falls back
  -- to `created_at` — an approximation, and the reason it is not a tighter
  -- period. An invite with neither an expiry nor a use cap is a standing open
  -- door and is deliberately never purged.
  delete from public.app_invites
   where (expires_at is not null and expires_at < now() - interval '90 days')
      or (max_uses is not null and use_count >= max_uses
          and created_at < now() - interval '90 days');

  delete from public.campaign_invites
   where (expires_at is not null and expires_at < now() - interval '90 days')
      or (max_uses is not null and use_count >= max_uses
          and created_at < now() - interval '90 days');

  -- ── Product signal — 365 days ───────────────────────────────────────────
  -- A "notify me" click is a statement about what someone wanted a year ago.
  -- Kept longer it inflates a buy-signal counter with people who have moved on,
  -- so the retention period and the metric's honesty want the same number. The
  -- click is repeatable, which is what makes expiring it harmless.
  delete from public.feature_interest
   where created_at < now() - interval '365 days';

  -- ── Waitlist — purpose-bound, with a 365-day backstop ───────────────────
  -- The privacy policy commits to deleting this list "once that launch email
  -- has gone out", which is a purpose no cron job can observe — so sending
  -- that email is an operational step that includes emptying the table, and
  -- this is only the backstop for a list that is never sent to. These are bare
  -- addresses with no account behind them, so no erasure path reaches them
  -- either (retention.md, Known gaps); a year is as long as an address
  -- collected for one email can be justified.
  delete from public.pro_waitlist
   where created_at < now() - interval '365 days';
end;
$$;

comment on function private.purge_expired_retention() is
  'Enforces every bounded retention period in context/compliance/retention.md. Called daily by the purge-expired-retention cron job.';

revoke execute on function private.purge_expired_retention() from public;

-- ── 5. Schedule ─────────────────────────────────────────────────────────────
-- 04:20 UTC, behind the 04:00 AI-prompt scrub and the 04:10 bug-report purge,
-- so the three retention jobs run in a predictable order in one quiet window
-- rather than contending. Unschedule-then-schedule so a re-run of this
-- migration is idempotent, matching 20260809000002.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-expired-retention') then
    perform cron.unschedule('purge-expired-retention');
  end if;
end $$;

select cron.schedule(
  'purge-expired-retention',
  '20 4 * * *',
  $$ select private.purge_expired_retention(); $$
);
