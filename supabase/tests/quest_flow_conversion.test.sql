begin;

create extension if not exists pgtap with schema extensions;
select plan(26);

select has_column('public', 'quests', 'flow_enabled_at', 'quests explicitly opt into flow mode');
select has_column('public', 'quest_beats', 'conversion_source_type', 'generated beats retain rollback provenance');
select has_function('public', 'preview_quest_flow_conversion', array['uuid'], 'conversion has a read-only preview');
select has_function('public', 'convert_quest_to_flow', array['uuid', 'boolean'], 'conversion is atomic');
select has_function('public', 'rollback_quest_flow_conversion', array['uuid'], 'conversion is reversible');

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('65900000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue659-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('65900000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'issue659-outsider@example.invalid', '', '{}'::jsonb, '{}'::jsonb);
insert into public.campaigns (id, user_id, name)
values ('65900000-0000-4000-8000-000000000010', '65900000-0000-4000-8000-000000000001', 'Conversion campaign');
insert into public.campaign_members (campaign_id, user_id, role, display_name)
values ('65900000-0000-4000-8000-000000000010', '65900000-0000-4000-8000-000000000001', 'dm', 'DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;
insert into public.party_members (id, user_id, owner_user_id, campaign_id, name)
values ('65900000-0000-4000-8000-000000000020', '65900000-0000-4000-8000-000000000001', '65900000-0000-4000-8000-000000000001', '65900000-0000-4000-8000-000000000010', 'Shared hero');

insert into public.quests (id, user_id, campaign_id, parent_quest_id, title, summary, description, notes, reward_gp, rewards, player_visible_to) values
  ('65900000-0000-4000-8000-000000000030', '65900000-0000-4000-8000-000000000001', '65900000-0000-4000-8000-000000000010', null, 'Complex legacy quest', 'Find the vault', '{"type":"doc"}', 'Keep this note', 50, 'A title deed', array['65900000-0000-4000-8000-000000000020']::uuid[]),
  ('65900000-0000-4000-8000-000000000031', '65900000-0000-4000-8000-000000000001', '65900000-0000-4000-8000-000000000010', '65900000-0000-4000-8000-000000000030', 'Subquest', null, null, null, 0, null, '{}'::uuid[]),
  ('65900000-0000-4000-8000-000000000032', '65900000-0000-4000-8000-000000000001', '65900000-0000-4000-8000-000000000010', null, 'Empty quest', null, null, null, 0, null, '{}'::uuid[]),
  ('65900000-0000-4000-8000-000000000033', '65900000-0000-4000-8000-000000000001', '65900000-0000-4000-8000-000000000010', null, 'Single encounter quest', null, null, null, 0, null, '{}'::uuid[]);
insert into public.quest_objectives (id, quest_id, description, sort_order)
values ('65900000-0000-4000-8000-000000000040', '65900000-0000-4000-8000-000000000030', 'Open the vault', 0);
insert into public.quest_triggers (id, user_id, quest_id, objective_id, trigger_type, action_type, action_payload)
values ('65900000-0000-4000-8000-000000000041', '65900000-0000-4000-8000-000000000001', '65900000-0000-4000-8000-000000000030', '65900000-0000-4000-8000-000000000040', 'objective_done', 'send_broadcast', '{"message":"Vault opened"}');
insert into public.encounters (id, user_id, campaign_id, name) values
  ('65900000-0000-4000-8000-000000000050', '65900000-0000-4000-8000-000000000001', '65900000-0000-4000-8000-000000000010', 'Gate guards'),
  ('65900000-0000-4000-8000-000000000051', '65900000-0000-4000-8000-000000000001', '65900000-0000-4000-8000-000000000010', 'Vault guardian'),
  ('65900000-0000-4000-8000-000000000052', '65900000-0000-4000-8000-000000000001', '65900000-0000-4000-8000-000000000010', 'Solo threat');
insert into public.quest_refs (id, quest_id, ref_type, ref_id, is_player_visible) values
  ('65900000-0000-4000-8000-000000000060', '65900000-0000-4000-8000-000000000030', 'encounter', '65900000-0000-4000-8000-000000000050', true),
  ('65900000-0000-4000-8000-000000000061', '65900000-0000-4000-8000-000000000030', 'encounter', '65900000-0000-4000-8000-000000000051', false),
  ('65900000-0000-4000-8000-000000000062', '65900000-0000-4000-8000-000000000033', 'encounter', '65900000-0000-4000-8000-000000000052', false);
insert into public.quest_beats (id, quest_id, campaign_id, title)
values ('65900000-0000-4000-8000-000000000070', '65900000-0000-4000-8000-000000000030', '65900000-0000-4000-8000-000000000010', 'Hand-authored beat');

set local role authenticated;
select set_config('request.jwt.claim.sub', '65900000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((public.preview_quest_flow_conversion('65900000-0000-4000-8000-000000000032')->>'encounter_refs')::integer, 0, 'a quest with no encounters previews zero combat beats');
select is((public.preview_quest_flow_conversion('65900000-0000-4000-8000-000000000033')->>'encounter_beats_to_create')::integer, 1, 'a quest with one encounter previews one unconnected combat beat');
select is((public.preview_quest_flow_conversion('65900000-0000-4000-8000-000000000030')->>'encounter_beats_to_create')::integer, 2, 'many encounter refs are counted without inferring order');
select is((public.preview_quest_flow_conversion('65900000-0000-4000-8000-000000000030')->>'objectives_preserved')::integer, 1, 'preview names preserved objectives');
select is((public.preview_quest_flow_conversion('65900000-0000-4000-8000-000000000030')->>'triggers_preserved')::integer, 1, 'preview names preserved triggers');
select is((select count(*)::integer from public.quest_beats where quest_id = '65900000-0000-4000-8000-000000000030'), 1, 'preview writes nothing');

select is((public.convert_quest_to_flow('65900000-0000-4000-8000-000000000030', true)->>'encounter_beats_created')::integer, 2, 'conversion creates one staging beat per encounter ref');
select is((select count(*)::integer from public.quest_beats where quest_id = '65900000-0000-4000-8000-000000000030' and conversion_source_type = 'legacy_overview'), 1, 'selected overview becomes one hidden discovery beat');
select is((select count(*)::integer from public.quest_beat_edges where quest_id = '65900000-0000-4000-8000-000000000030'), 0, 'conversion never invents narrative edges');
select is((select count(*)::integer from public.quest_beat_attachments where quest_id = '65900000-0000-4000-8000-000000000030' and attachment_type = 'encounter'), 2, 'combat beats reuse the existing encounters as attachments');
select is((select count(*)::integer from public.quest_refs where quest_id = '65900000-0000-4000-8000-000000000030'), 2, 'legacy refs remain authoritative and are not duplicated');
select isnt((select flow_enabled_at from public.quests where id = '65900000-0000-4000-8000-000000000030'), null, 'conversion explicitly enables flow mode');

select lives_ok($$ select public.convert_quest_to_flow('65900000-0000-4000-8000-000000000030', true) $$, 'running conversion twice is safe');
select is((select count(*)::integer from public.quest_beats where quest_id = '65900000-0000-4000-8000-000000000030'), 4, 'idempotent conversion creates no duplicate overview or combat beats');
select ok((select notes = 'Keep this note' and reward_gp = 50 and rewards = 'A title deed' and cardinality(player_visible_to) = 1 from public.quests where id = '65900000-0000-4000-8000-000000000030'), 'quest fields, rewards, and sharing remain unchanged');
select is((select count(*)::integer from public.quest_objectives where quest_id = '65900000-0000-4000-8000-000000000030') + (select count(*)::integer from public.quest_triggers where quest_id = '65900000-0000-4000-8000-000000000030') + (select count(*)::integer from public.quests where parent_quest_id = '65900000-0000-4000-8000-000000000030'), 3, 'objectives, consequences, and subquests survive conversion');

select is(public.rollback_quest_flow_conversion('65900000-0000-4000-8000-000000000030'), 3, 'rollback removes exactly the conversion-created beats');
select is((select count(*)::integer from public.quest_beats where quest_id = '65900000-0000-4000-8000-000000000030' and title = 'Hand-authored beat'), 1, 'rollback preserves separately authored flow rows');
select is((select count(*)::integer from public.quest_refs where quest_id = '65900000-0000-4000-8000-000000000030'), 2, 'rollback never removes legacy encounter refs');
select is((select flow_enabled_at from public.quests where id = '65900000-0000-4000-8000-000000000030'), null::timestamptz, 'rollback returns the quest to legacy mode');

select set_config('request.jwt.claim.sub', '65900000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select public.preview_quest_flow_conversion('65900000-0000-4000-8000-000000000030') $$,
  'P0001', 'Only the campaign DM can convert this quest',
  'non-members cannot inspect conversion details'
);

select * from finish();
rollback;
