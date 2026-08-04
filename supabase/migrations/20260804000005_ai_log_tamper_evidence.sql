-- Migration: ai_log_tamper_evidence
--
-- #609 (voluntary hardening, not a legal duty — Grimoire matches no AI Act
-- high-risk category; see the issue and
-- context/compliance/provenance-architecture.md §8 / ai-act.md §6a). Hardens
-- the AI usage record — ai_credit_ledger, ai_generation_jobs,
-- image_generation_jobs — which is the evidence base for billing disputes
-- and abuse investigation, and doubles as Art 50 supporting evidence if ever
-- asked.
--
-- ── 1. No client UPDATE/DELETE path (grants + RLS) ─────────────────────────
--
-- Supabase grants ALL privileges on every public-schema table to anon/
-- authenticated by default; RLS is the actual gate. Audited what's live today
-- (information_schema.table_privileges + pg_policies, checked before writing
-- this migration):
--
--   ai_credit_ledger      — SELECT (own + admin), INSERT (admin-grant only)
--                           policies exist; no UPDATE/DELETE policy, so both
--                           are already unreachable for anon/authenticated.
--                           Table-level grant revoked below anyway — defense
--                           in depth against a future stray policy or a
--                           `disable row level security` mistake.
--   ai_generation_jobs    — SELECT (own) policy only; every write is
--                           server-side via SECURITY DEFINER functions
--                           (settle/fail/acknowledge/finalize, migration
--                           20260730000002). Already unreachable; grant
--                           revoked below too.
--   image_generation_jobs — SELECT/INSERT/UPDATE/DELETE ALL granted to the
--                           owning user (migration 20260529000003). UPDATE is
--                           the real gap: no application code anywhere calls
--                           `.update()` on this table (verified by grep
--                           across src/ and supabase/functions/) — every
--                           legitimate write (status transitions, image_url,
--                           error) goes through the service-role admin
--                           client or the fail-stale-image-jobs cron. The
--                           owner-UPDATE policy was pure attack surface: a
--                           forged `PATCH /rest/v1/image_generation_jobs?
--                           id=eq.<uuid>` with a valid user JWT could rewrite
--                           a job's status, image_url, model, provider or
--                           prompt after the fact. Dropped below.
--
--                           DELETE is INTENTIONALLY KEPT.
--                           useDeleteGalleryImage (useGalleryImages.ts) is a
--                           real, shipped feature — a user removing their own
--                           generated image from the Gallery. That is the
--                           user exercising control over their own content,
--                           not tampering with a log entry to misrepresent
--                           what happened, and this table (unlike
--                           ai_credit_ledger) is not the billing evidence of
--                           record. Drawing this boundary explicitly here
--                           rather than silently leaving the gap or breaking
--                           a live feature to close it anyway.
--
-- ── 2. ai_credit_ledger: trigger-enforced append-only ──────────────────────
--
-- Audited every ledger-writing code path before writing the guard:
--   _shared/credits.ts        — spendCredits/recordSpend/recordGeneration/
--                                recordFreeGeneration all INSERT only.
--   creditLots.ts              — pure read-side FIFO projection; no writes.
--   reserve_credits()          — INSERTs pending=true hold rows
--                                 (20260621000007).
--   release_credits()          — DELETEs pending=true rows by id; never
--                                 UPDATEs (20260621000007).
--   spend_credits()             — INSERTs settled rows (20260615000003,
--                                 20260628000005).
--   settle_ai_generation_job() / fail_ai_generation_job()
--                               — release_credits() (DELETE of the pending
--                                 hold) + a SEPARATE fresh INSERT via
--                                 spend_credits()/recordGeneration() for the
--                                 real spend (20260730000002). The
--                                 "reservation settles" language in
--                                 20260621000007's own comments means
--                                 insert-a-new-row-then-delete-the-hold, NOT
--                                 an in-place UPDATE of the pending row.
--   clawback_pack_credits()    — INSERTs a pack_refund row
--                                 (20260628000005).
--   stripe-webhook / admin-refund-credit-pack
--                               — both INSERT-only (idempotency checked via
--                                 a prior SELECT, never an UPDATE).
--   release-stale-credit-holds cron (20260720000007)
--                               — DELETEs pending=true rows older than 2h;
--                                 never UPDATEs.
--
-- Conclusion: there is no legitimate UPDATE transition on this table at all —
-- not "pending rows may change, settled rows may not"; genuinely zero rows,
-- pending or settled, are ever updated in place by any code path. (One
-- historical exception: migration 20260614000001 ran a one-time backfill
-- `update ai_credit_ledger set bucket = ...` before this trigger existed;
-- already applied to every environment that will ever run it, so it cannot
-- recur.) The UPDATE guard therefore blocks ALL updates unconditionally —
-- that IS the exact sanctioned-transition set, proven empty by the audit
-- above rather than assumed.
--
-- DELETE has exactly one sanctioned transition: releasing a still-PENDING
-- reservation hold (reserve_credits/release_credits, 20260621000007, and the
-- release-stale-credit-holds cron sweep, 20260720000007) — both delete only
-- `pending = true` rows. A settled row (`pending = false`) must never be
-- removed; the DELETE guard allows the former and blocks the latter.
--
-- A future legitimate data-fix migration on this table must explicitly
-- `alter table ai_credit_ledger disable trigger ai_credit_ledger_guard_update`
-- (and/or `..._guard_delete`) first; that friction is the intended cost of
-- tamper evidence, not an oversight.
--
-- ── 3. Retention: prompt-bearing columns scrubbed after 90 days ────────────
--
-- Decision (Jeffrey / #609, 4 Aug 2026): billing/telemetry columns (delta,
-- reason, model, provider, token counts, image_count, status, timestamps)
-- are the evidence base for billing disputes and cost reporting and are kept
-- indefinitely — they carry no prompt content. Free-text prompt/request
-- content is a separate GDPR liability with no comparable retention need, so
-- it is time-boxed: `image_generation_jobs.prompt` and
-- `ai_generation_jobs.request_json` are cleared (not row-deleted — the row
-- and its billing fields remain) 90 days after creation. Scheduled via
-- pg_cron, following the exact pattern already used by fail-stale-image-jobs
-- (20260613000004), fail-stale-ai-generation-jobs (20260730000002) and
-- release-stale-credit-holds (20260720000007). Both target columns are NOT
-- NULL, so "cleared" means the column's empty value (`''` / `'{}'::jsonb`),
-- not SQL NULL. `request_json` is only read while a job is queued/running/
-- settling (generate-music reads it once, inside the same settlement
-- transaction that consumes it into `sounds`); 90-day-old rows are always
-- long past that. `image_generation_jobs.prompt` is user-visible in the
-- Gallery (search + alt text) — after scrubbing, old entries show blank
-- prompt text, an accepted trade-off of the retention window.

-- ── 1. No client UPDATE/DELETE path (grants + RLS) ─────────────────────────

revoke update, delete on public.ai_credit_ledger      from anon, authenticated;
revoke update, delete on public.ai_generation_jobs     from anon, authenticated;
revoke update         on public.image_generation_jobs  from anon, authenticated;

drop policy if exists "image_generation_jobs_update" on public.image_generation_jobs;

-- ── 2. ai_credit_ledger: trigger-enforced append-only ──────────────────────

create or replace function public.ai_credit_ledger_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- No code path ever updates an existing ai_credit_ledger row, pending or
  -- settled (see migration header) — inserts create new rows, and the
  -- reservation lifecycle deletes pending holds rather than updating them.
  raise exception 'ai_credit_ledger is append-only — row % cannot be updated', old.id;
end;
$$;

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
  -- removed.
  if old.pending then
    return old;
  end if;
  raise exception 'ai_credit_ledger is append-only — settled row % cannot be deleted', old.id;
end;
$$;

-- Trigger functions bypass the EXECUTE check, so keep them off the RPC surface.
revoke execute on function public.ai_credit_ledger_guard_update() from public, anon, authenticated;
revoke execute on function public.ai_credit_ledger_guard_delete() from public, anon, authenticated;

drop trigger if exists ai_credit_ledger_guard_update on public.ai_credit_ledger;
create trigger ai_credit_ledger_guard_update
  before update on public.ai_credit_ledger
  for each row execute procedure public.ai_credit_ledger_guard_update();

drop trigger if exists ai_credit_ledger_guard_delete on public.ai_credit_ledger;
create trigger ai_credit_ledger_guard_delete
  before delete on public.ai_credit_ledger
  for each row execute procedure public.ai_credit_ledger_guard_delete();

-- ── 3. Retention: prompt-bearing columns scrubbed after 90 days ────────────

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'scrub-stale-ai-prompt-content') then
    perform cron.unschedule('scrub-stale-ai-prompt-content');
  end if;
end $$;

select cron.schedule(
  'scrub-stale-ai-prompt-content',
  '0 4 * * *',  -- daily at 04:00 UTC
  $$
    update public.image_generation_jobs
    set prompt = ''
    where prompt <> ''
      and created_at < now() - interval '90 days';

    update public.ai_generation_jobs
    set request_json = '{}'::jsonb
    where request_json <> '{}'::jsonb
      and created_at < now() - interval '90 days';
  $$
);
