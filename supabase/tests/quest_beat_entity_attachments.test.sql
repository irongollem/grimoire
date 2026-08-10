begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

select ok(
  position('item' in pg_get_constraintdef(oid)) > 0,
  'beat attachment types include items'
) from pg_constraint where conname = 'quest_beat_attachments_attachment_type_check';

select ok(
  position('monster' in pg_get_constraintdef(oid)) > 0,
  'beat attachment types include monsters'
) from pg_constraint where conname = 'quest_beat_attachments_attachment_type_check';

select ok(
  position('when ''item''' in lower(pg_get_functiondef('private.validate_quest_beat_attachment()'::regprocedure))) > 0,
  'item placements validate their authoritative record'
);

select ok(
  position('when ''monster''' in lower(pg_get_functiondef('private.validate_quest_beat_attachment()'::regprocedure))) > 0,
  'monster placements validate their authoritative record'
);

select ok(
  position('when ''item'' then ''item''' in lower(pg_get_functiondef('private.sync_quest_ref_from_beat_attachment()'::regprocedure))) > 0,
  'item placements preserve quest-level references'
);

select ok(
  position('when ''monster'' then ''monster''' in lower(pg_get_functiondef('private.sync_quest_ref_from_beat_attachment()'::regprocedure))) > 0,
  'monster placements preserve quest-level references'
);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values ('67200000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue672-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name) values
  ('67200000-0000-4000-8000-000000000010', '67200000-0000-4000-8000-000000000001', 'Contained tools'),
  ('67200000-0000-4000-8000-000000000011', '67200000-0000-4000-8000-000000000001', 'Other campaign');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('67200000-0000-4000-8000-000000000010', '67200000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;
insert into public.quests (id, user_id, campaign_id, title) values
  ('67200000-0000-4000-8000-000000000020', '67200000-0000-4000-8000-000000000001', '67200000-0000-4000-8000-000000000010', 'Run quest');
insert into public.quest_beats (id, quest_id, campaign_id, title) values
  ('67200000-0000-4000-8000-000000000030', '67200000-0000-4000-8000-000000000020', '67200000-0000-4000-8000-000000000010', 'Entity beat');
insert into public.items (id, user_id, campaign_id, name) values
  ('67200000-0000-4000-8000-000000000040', '67200000-0000-4000-8000-000000000001', '67200000-0000-4000-8000-000000000010', 'Beat relic'),
  ('67200000-0000-4000-8000-000000000041', '67200000-0000-4000-8000-000000000001', '67200000-0000-4000-8000-000000000011', 'Foreign relic');
insert into public.monsters (id, user_id, campaign_id, name) values
  ('67200000-0000-4000-8000-000000000050', '67200000-0000-4000-8000-000000000001', '67200000-0000-4000-8000-000000000010', 'Beat monster');

set local role authenticated;
select set_config('request.jwt.claim.sub', '67200000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select lives_ok($$
  insert into public.quest_beat_attachments (beat_id, quest_id, campaign_id, attachment_type, ref_id)
  values ('67200000-0000-4000-8000-000000000030', '67200000-0000-4000-8000-000000000020', '67200000-0000-4000-8000-000000000010', 'item', '67200000-0000-4000-8000-000000000040')
$$, 'a DM can place a campaign item on a beat');

select lives_ok($$
  insert into public.quest_beat_attachments (beat_id, quest_id, campaign_id, attachment_type, ref_id)
  values ('67200000-0000-4000-8000-000000000030', '67200000-0000-4000-8000-000000000020', '67200000-0000-4000-8000-000000000010', 'monster', '67200000-0000-4000-8000-000000000050')
$$, 'a DM can place a campaign monster on a beat');

select is(
  (select count(*)::integer from public.quest_refs where quest_id = '67200000-0000-4000-8000-000000000020' and ref_type in ('item', 'monster')),
  2,
  'entity placements retain authoritative quest references'
);

select throws_ok($$
  insert into public.quest_beat_attachments (beat_id, quest_id, campaign_id, attachment_type, ref_id)
  values ('67200000-0000-4000-8000-000000000030', '67200000-0000-4000-8000-000000000020', '67200000-0000-4000-8000-000000000010', 'item', '67200000-0000-4000-8000-000000000041')
$$, '23514', null, 'an item attachment cannot cross campaigns');

select * from finish();
rollback;
