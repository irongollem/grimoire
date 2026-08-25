begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

-- Cover for the #769 sweep (20260825003319). Two properties are being pinned,
-- and the second one is the reason this file exists rather than trusting the
-- migration's comment:
--
--   1. The sweep fails a *stranded* extraction and nothing else. Every status
--      it must not touch is asserted by name, because the tempting widening —
--      "sweep everything past expires_at" — silently destroys a `review` row
--      holding extraction the DM has paid for.
--   2. The sweep touches no storage object. SQL deletion orphans the blob
--      (Supabase's own guidance, quoted in the migration), so an addition here
--      that looks like tidying up would make the bytes unreachable forever.
--      Asserted against the function body: an outcome test cannot see the
--      absence of a statement nobody has written yet.

select has_function('private', 'sweep_stranded_document_imports',
  'the stranded-import sweep exists');

-- ── Fixture ──────────────────────────────────────────────────────────────────
-- One DM, one campaign, one row per status the sweep has an opinion about. All
-- five are stale by the liveness clock (30 minutes against a 15-minute window)
-- except the control, so status is the only variable between them.
--
-- `source_kind = 'pdf'` with a single path throughout, to satisfy
-- `document_imports_source_shape_check`.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('76900000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
        'authenticated', 'authenticated', 'issue769-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('76900000-0000-4000-8000-000000000010', '76900000-0000-4000-8000-000000000001', 'Sweep campaign');

insert into public.document_imports
  (id, user_id, campaign_id, source_kind, source_paths, display_name, page_count,
   status, rights_attested_at, expires_at, updated_at)
values
  ('76900000-0000-4000-8000-000000000101', '76900000-0000-4000-8000-000000000001',
   '76900000-0000-4000-8000-000000000010', 'pdf',
   array['76900000-0000-4000-8000-000000000001/stranded.pdf'], 'Stranded', 4,
   'extracting', now(), now() + interval '24 hours', now() - interval '30 minutes'),

  ('76900000-0000-4000-8000-000000000102', '76900000-0000-4000-8000-000000000001',
   '76900000-0000-4000-8000-000000000010', 'pdf',
   array['76900000-0000-4000-8000-000000000001/running.pdf'], 'Still running', 4,
   'extracting', now(), now() + interval '24 hours', now() - interval '1 minute'),

  ('76900000-0000-4000-8000-000000000103', '76900000-0000-4000-8000-000000000001',
   '76900000-0000-4000-8000-000000000010', 'pdf',
   array['76900000-0000-4000-8000-000000000001/unstarted.pdf'], 'Never started', 4,
   'pending', now(), now() + interval '24 hours', now() - interval '30 minutes'),

  ('76900000-0000-4000-8000-000000000104', '76900000-0000-4000-8000-000000000001',
   '76900000-0000-4000-8000-000000000010', 'pdf',
   array['76900000-0000-4000-8000-000000000001/reviewing.pdf'], 'Under review', 4,
   'review', now(), now() - interval '1 hour', now() - interval '30 minutes'),

  ('76900000-0000-4000-8000-000000000105', '76900000-0000-4000-8000-000000000001',
   '76900000-0000-4000-8000-000000000010', 'pdf',
   array['76900000-0000-4000-8000-000000000001/done.pdf'], 'Finished', 4,
   'complete', now(), now() - interval '1 hour', now() - interval '30 minutes');

select private.sweep_stranded_document_imports();

-- ── What it collects ─────────────────────────────────────────────────────────

select is(
  (select status from public.document_imports where id = '76900000-0000-4000-8000-000000000101'),
  'failed',
  'an extraction stalled past the liveness window is failed');

select ok(
  (select error from public.document_imports where id = '76900000-0000-4000-8000-000000000101')
    like '%retry%',
  'the failure tells the DM the document is still there and can be retried');

-- ── What it must leave alone ─────────────────────────────────────────────────

select is(
  (select status from public.document_imports where id = '76900000-0000-4000-8000-000000000102'),
  'extracting',
  'an extraction inside the liveness window is left running');

-- Unstarted is not stranded: nothing claimed it, so nothing died holding it.
-- It is collected by expiry, not by liveness.
select is(
  (select status from public.document_imports where id = '76900000-0000-4000-8000-000000000103'),
  'pending',
  'a staged-but-unstarted import is not failed by the liveness sweep');

-- The expensive mistake. This row is past `expires_at` *and* stale, so the
-- obvious widening reaches it — and `extracted` here is paid-for work whose
-- source document has already been deleted.
select is(
  (select status from public.document_imports where id = '76900000-0000-4000-8000-000000000104'),
  'review',
  'a row awaiting review is never swept, even past its expiry');

select is(
  (select status from public.document_imports where id = '76900000-0000-4000-8000-000000000105'),
  'complete',
  'a finished import is never swept');

-- ── Restarting an import restarts its clock ──────────────────────────────────
--
-- Retrying a failed import reuses the retained upload (ef9e34e5). Without the
-- trigger the row goes back to `pending` still expired, and the collector is
-- entitled to delete the source while the retry is running.

update public.document_imports
   set expires_at = now() - interval '1 hour'
 where id = '76900000-0000-4000-8000-000000000101';

update public.document_imports
   set status = 'pending', error = null
 where id = '76900000-0000-4000-8000-000000000101';

select ok(
  (select expires_at from public.document_imports where id = '76900000-0000-4000-8000-000000000101')
    > now() + interval '23 hours',
  'returning a row to pending pushes its expiry forward');

-- The trigger keys on the transition, not on every write: a row already pending
-- must not renew itself each time an unrelated column is touched.
update public.document_imports
   set expires_at = now() + interval '2 hours'
 where id = '76900000-0000-4000-8000-000000000103';

update public.document_imports
   set display_name = 'Renamed'
 where id = '76900000-0000-4000-8000-000000000103';

select ok(
  (select expires_at from public.document_imports where id = '76900000-0000-4000-8000-000000000103')
    < now() + interval '3 hours',
  'an update that does not change status leaves the expiry where it was');

-- ── Structural ───────────────────────────────────────────────────────────────

select ok(
  exists (select 1 from cron.job where jobname = 'sweep-stranded-document-imports' and active),
  'the sweep is actually scheduled');

-- Body-based on purpose. Deleting a storage.objects row from SQL removes the
-- metadata and strands the bytes in S3, reachable by nothing — strictly worse
-- than leaving the object in place, where `source_paths` still points at it.
-- Collection belongs to code holding a Storage API client.
select ok(
  pg_get_functiondef('private.sweep_stranded_document_imports()'::regprocedure)
    not like '%storage.objects%',
  'the sweep never deletes a storage row from SQL, which would orphan the blob');

select * from finish();
rollback;
