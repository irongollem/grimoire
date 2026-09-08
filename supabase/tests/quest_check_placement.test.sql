begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

-- A check is a placement that carries its own data (#850, frames 03/04):
-- ref_id is the literal 'check', the metadata names a skill and a DC.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('85300000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'check-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name)
values ('85300000-0000-4000-8000-000000000010', '85300000-0000-4000-8000-000000000001', 'Check campaign');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('85300000-0000-4000-8000-000000000010', '85300000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;
insert into public.quests (id, user_id, campaign_id, title)
values ('85300000-0000-4000-8000-000000000020', '85300000-0000-4000-8000-000000000001', '85300000-0000-4000-8000-000000000010', 'Checked');
insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('85300000-0000-4000-8000-000000000030', '85300000-0000-4000-8000-000000000020', '85300000-0000-4000-8000-000000000010', 'The cloister');

set local role authenticated;
select set_config('request.jwt.claim.sub', '85300000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok($$
  insert into public.quest_beat_attachments (beat_id, quest_id, campaign_id, attachment_type, ref_id, metadata)
  values ('85300000-0000-4000-8000-000000000030', '85300000-0000-4000-8000-000000000020', '85300000-0000-4000-8000-000000000010',
          'check', 'check', '{"skill": "Insight", "dc": 15, "contested_by": "Deception"}'::jsonb)
$$, 'a check with a skill and a DC is a valid placement');

select throws_ok($$
  insert into public.quest_beat_attachments (beat_id, quest_id, campaign_id, attachment_type, ref_id, metadata)
  values ('85300000-0000-4000-8000-000000000030', '85300000-0000-4000-8000-000000000020', '85300000-0000-4000-8000-000000000010',
          'check', 'check', '{"skill": "Insight"}'::jsonb)
$$, '23514', null, 'a check without a DC is refused');

select throws_ok($$
  insert into public.quest_beat_attachments (beat_id, quest_id, campaign_id, attachment_type, ref_id, metadata)
  values ('85300000-0000-4000-8000-000000000030', '85300000-0000-4000-8000-000000000020', '85300000-0000-4000-8000-000000000010',
          'check', '85300000-0000-4000-8000-000000000030', '{"skill": "Insight", "dc": 15}'::jsonb)
$$, '23514', null, 'a check''s ref_id is the literal check, never a row id');

select is(
  (select count(*)::integer from public.quest_beat_attachments where beat_id = '85300000-0000-4000-8000-000000000030'),
  1, 'exactly the valid check landed'
);

select * from finish();
rollback;
