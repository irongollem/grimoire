-- Migration: sweep_stranded_document_imports
--
-- Closes #769: a document import whose extractor died between the atomic claim
-- (`pending` → `extracting`) and settlement had nothing to move it on. The row
-- sat in `extracting` forever, the wizard polled it forever, and the DM was
-- shown a spinner rather than a failure they could act on.
--
-- ── Two clocks, because there are two different failures ─────────────────────
--
-- The obvious reading of #769 is "sweep everything past `expires_at`", and it
-- is wrong in the direction that matters. `expires_at` is 24 hours: using it as
-- the liveness signal means a DM whose extraction crashed after four seconds
-- watches a spinner for the rest of the day before being told. Liveness and
-- retention are different questions and want different intervals:
--
--   `extracting` too long  →  the worker died.        Minutes. Handled here.
--   past `expires_at`      →  nobody is coming back.  A day. Handled by the
--                             collector in `import-extract` (see below).
--
-- 15 minutes is the liveness window, against a measured extraction of well
-- under a minute for a four-page document on `gpt-5.6-luna` (20260825000600)
-- and an edge isolate that cannot outlive its own wall-clock limit anyway. It
-- is the same shape as `fail-stale-image-jobs` (10 min) and
-- `fail-stale-ai-generation-jobs`, and measured from `updated_at`, which the
-- `document_imports_updated_at` trigger stamps at the moment of the claim.
--
-- ── Why this file does not delete a single storage object ────────────────────
--
-- It is the obvious thing to add here and it would be a bug. Supabase's own
-- guidance is explicit: "Deleting objects should always be done via the Storage
-- API and NOT via a SQL query. Deleting objects via a SQL query will not remove
-- the object from the bucket and will result in the object being orphaned."
-- (docs/guides/storage/management/delete-objects; the same trap is recorded at
-- 20260809000002 for `delete from storage.buckets`.)
--
-- So a `delete from storage.objects` here would be strictly worse than doing
-- nothing: today the blob is reachable through `document_imports.source_paths`
-- and deletable by the owner, by the edge function, or by the account-erasure
-- path. Drop the metadata row and the bytes stay in S3, reachable by nothing
-- and deletable by nothing — the exact opposite of the transience the feature
-- promises (see the "Source documents are transient" note in 20260824204224).
--
-- The collection therefore has to go through the Storage API, which means code
-- with a Storage client. That is `import-extract`, which already holds one, is
-- the only thing that ever creates these objects, and already deletes them on
-- every settled path — it sweeps expired rows opportunistically at the head of
-- each invocation.
--
-- The alternative — pg_cron → pg_net → a dedicated edge function — is the
-- established shape in this repo (`poll-meshy-jobs`, 20260718000007) and was
-- rejected on the evidence of that very job: it needs a URL and a bearer token
-- in `vault` plus an env var on the function, and if any is missing it returns
-- silently. In this database `vault.secrets` holds exactly one row
-- (`marketing_deploy_hook`), so `poll-meshy-jobs` has been scheduled, active,
-- and doing nothing at all since 18 July. A cleanup job whose failure mode is
-- "looks scheduled, never runs" is not a cleanup job. Piggybacking on the one
-- code path that creates the garbage needs no provisioning and scales with the
-- activity that produces it: if nobody imports, nothing new is stranded either.
--
-- The cost of that choice, stated plainly: a quiet month leaves an expired
-- upload in the bucket until the next import of any kind. Bounded by the 25 MB
-- per-object cap and by the fact that the row keeps `source_paths`, so nothing
-- becomes unreachable in the meantime.
--
-- ── `review` is deliberately never swept ─────────────────────────────────────
--
-- It is a non-terminal status and it is not stranded. Its source objects were
-- already deleted at the `review` transition, so there is nothing to collect,
-- and `extracted` is work the DM has paid credits for and may reasonably come
-- back to next week. `expires_at` governs how long we hold *someone else's
-- document*, which by then we no longer hold at all.
create or replace function private.sweep_stranded_document_imports()
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.document_imports
     set status = 'failed',
         error  = 'The extractor stopped responding before it finished. Your document is still here — retry the extraction.'
   where status = 'extracting'
     and updated_at < now() - interval '15 minutes';
end;
$$;

comment on function private.sweep_stranded_document_imports() is
  'Fails document imports whose extractor died mid-claim, so the wizard shows a retryable error instead of polling forever. Called every 5 minutes by the sweep-stranded-document-imports cron. Deliberately touches no storage object: SQL deletion orphans the blob (see the migration body).';

revoke execute on function private.sweep_stranded_document_imports() from public;

-- ── Restarting an import restarts its clock ──────────────────────────────────
--
-- A failed import keeps its uploaded document precisely so the DM can retry
-- without paying to upload it again (ef9e34e5), and the tab offers that as a
-- button. Retrying is a `failed` → `pending` update, and without this trigger
-- it would leave `expires_at` where it was — so a document retried on day two
-- is already expired at the moment it is restarted, and the collector is
-- entitled to delete the source out from under a running extraction.
--
-- In the trigger rather than in the client that happens to issue the update:
-- `expires_at` means "nobody has come back to this in a day", and any code path
-- that returns a row to `pending` is somebody coming back. A rule the client
-- has to remember is a rule the next client forgets.
create or replace function public.document_imports_restart_extends_expiry()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'pending' and old.status is distinct from 'pending' then
    new.expires_at := now() + interval '24 hours';
  end if;
  return new;
end;
$$;

comment on function public.document_imports_restart_extends_expiry() is
  'Pushes expires_at forward whenever a document import returns to pending, so retrying a failed import does not leave its source collectable mid-extraction.';

-- Trigger functions are invoked by the trigger system, which does not check
-- EXECUTE — so the grant only ever exposes it on the PostgREST RPC surface.
revoke execute on function public.document_imports_restart_extends_expiry() from public, anon, authenticated;

create trigger document_imports_restart_extends_expiry
  before update on public.document_imports
  for each row execute procedure public.document_imports_restart_extends_expiry();

-- ── Schedule ────────────────────────────────────────────────────────────────
-- Every 5 minutes, matching the other two liveness sweeps rather than the 04:xx
-- retention window: this one exists to shorten how long a DM stares at a
-- spinner, which is a foreground concern.
--
-- Unschedule-then-schedule so re-running the migration is idempotent, matching
-- 20260613000004 and 20260810000004.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sweep-stranded-document-imports') then
    perform cron.unschedule('sweep-stranded-document-imports');
  end if;
end $$;

select cron.schedule(
  'sweep-stranded-document-imports',
  '*/5 * * * *',
  $$ select private.sweep_stranded_document_imports(); $$
);
