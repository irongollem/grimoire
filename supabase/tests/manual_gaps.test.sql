begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

-- Ask Grimoire's manual gaps (20261123194159): written by the server alone, read and closed by the admin alone, and
-- holding nothing that says who asked.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('12600000-0000-4000-8000-0000000000a1', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gap-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('12600000-0000-4000-8000-0000000000a2', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'gap-admin@example.invalid', '', '{"role":"admin"}'::jsonb, '{}'::jsonb);

-- Bug caught: the ledger storing who asked, which would make an "anonymised" ledger a log of accounts.
select is_empty(
  $$ select 1 from information_schema.columns where table_schema = 'public' and table_name = 'manual_gaps'
       and column_name in ('user_id', 'campaign_id', 'session_id', 'author_id') $$,
  'the ledger has no column that could say who asked or where'
);

-- The same question asked again counts on one row.
select public.record_manual_gap('What is the difference between about and known to?', array['worldbuilding-canon']);
select public.record_manual_gap('  what is the difference between   ABOUT and known to ', array['worldbuilding-web']);
select is(
  (select asked_count from public.manual_gaps where question_key = 'what is the difference between about and known to'),
  2, 'a question asked again raises its count instead of adding a row'
);
select is(
  (select array_length(pages_checked, 1) from public.manual_gaps where question_key = 'what is the difference between about and known to'),
  2, 'the pages checked each time are kept, once each'
);

-- Bug caught: a signed-in account filling the ledger from the browser.
set local role authenticated;
set local request.jwt.claims to '{"sub": "12600000-0000-4000-8000-0000000000a1", "role": "authenticated"}';
select throws_ok(
  $$ select public.record_manual_gap('spam', '{}') $$,
  '42501', null, 'only the server records a gap'
);
-- Bug caught: any account reading what other DMs could not find.
select is_empty($$ select 1 from public.manual_gaps $$, 'an ordinary account reads no gaps');

set local request.jwt.claims to '{"sub": "12600000-0000-4000-8000-0000000000a2", "role": "authenticated", "app_metadata": {"role": "admin"}}';
select isnt_empty($$ select 1 from public.manual_gaps $$, 'positive control: the admin reads them');
update public.manual_gaps set covered_at = now();
select isnt_empty($$ select 1 from public.manual_gaps where covered_at is not null $$, 'the admin marks a gap covered');
reset role;

select * from finish();
rollback;
