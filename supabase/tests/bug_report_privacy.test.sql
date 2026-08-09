-- The invariants behind #633/#634 (migration 20260809000002).
--
-- These are the ones that break quietly. Nothing in the app reads `bug_reports`
-- except the admin panel, so a policy that silently widened — or a retention job
-- that silently stopped firing — would look exactly like a table nobody visits,
-- right up until a reporter's screenshot turns out to be readable by another
-- account or a two-year-old image is still sitting there.
--
-- Companion to context/compliance/data-subject-rights.md §4a.

begin;

create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('69000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bug-reporter@example.invalid',  '', '{}'::jsonb, '{}'::jsonb),
  ('69000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'bug-stranger@example.invalid',  '', '{}'::jsonb, '{}'::jsonb);

-- Written by the edge function under the service role, which is the only writer.
insert into public.bug_reports (id, user_id, kind, issue_number, screenshot, created_at)
values
  ('69000000-0000-4000-8000-000000000010', '69000000-0000-4000-8000-000000000001', 'bug', 9001,
   'data:image/jpeg;base64,QQ==', now()),
  ('69000000-0000-4000-8000-000000000011', '69000000-0000-4000-8000-000000000001', 'feature', 9002,
   'data:image/jpeg;base64,QQ==', now() - interval '91 days'),
  ('69000000-0000-4000-8000-000000000012', '69000000-0000-4000-8000-000000000002', 'bug', 9003,
   null, now() - interval '366 days');

-- ── The generated column tracks the column it describes ────────────────────
select is(
  (select has_screenshot from public.bug_reports where id = '69000000-0000-4000-8000-000000000010'),
  true,
  'has_screenshot is true while an image is stored'
);

select is(
  (select has_screenshot from public.bug_reports where id = '69000000-0000-4000-8000-000000000012'),
  false,
  'has_screenshot is false when no image was captured'
);

-- ── RLS: a report is the reporter's and the admin's, nobody else's ─────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '69000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::int from public.bug_reports),
  2,
  'a reporter sees their own reports'
);

select set_config('request.jwt.claim.sub', '69000000-0000-4000-8000-000000000002', true);

select is(
  (select count(*)::int from public.bug_reports),
  1,
  'a reporter does not see another account''s reports — including their screenshots'
);

-- Writes are service-role only: no INSERT/UPDATE/DELETE policy exists, and the
-- table grants are revoked besides. Either alone would be enough; both means a
-- future stray policy cannot open a write path on its own.
select throws_ok($$
  insert into public.bug_reports (user_id, kind) values (auth.uid(), 'bug')
$$, '42501', null, 'a client cannot mint a bug report');

select throws_ok($$
  update public.bug_reports set kind = 'feature' where issue_number = 9003
$$, '42501', null, 'a reporter cannot rewrite what they submitted');

select throws_ok($$
  delete from public.bug_reports where issue_number = 9003
$$, '42501', null, 'a reporter cannot delete their report out from under a maintainer');

reset role;

-- ── Retention (the cron body, run inline) ──────────────────────────────────
update public.bug_reports
   set screenshot = null,
       screenshot_purged_at = now()
 where screenshot is not null
   and created_at < now() - interval '90 days';

delete from public.bug_reports
 where created_at < now() - interval '365 days';

select is(
  (select screenshot from public.bug_reports where id = '69000000-0000-4000-8000-000000000011'),
  null,
  'retention clears a screenshot older than 90 days'
);

select isnt(
  (select screenshot_purged_at from public.bug_reports where id = '69000000-0000-4000-8000-000000000011'),
  null,
  'the purge is recorded, so a missing image is distinguishable from one never captured'
);

select is(
  (select screenshot from public.bug_reports where id = '69000000-0000-4000-8000-000000000010'),
  'data:image/jpeg;base64,QQ==',
  'retention leaves a screenshot inside the window alone'
);

select is(
  (select count(*)::int from public.bug_reports where issue_number = 9003),
  0,
  'retention deletes the reporter-to-issue link after 365 days'
);

-- ── Erasure reaches the report, per §2's "authored or owns" category ───────
delete from auth.users where id = '69000000-0000-4000-8000-000000000001';

select is(
  (select count(*)::int from public.bug_reports where user_id = '69000000-0000-4000-8000-000000000001'),
  0,
  'deleting the account cascades its bug reports away, screenshots included'
);

select * from finish();
rollback;
