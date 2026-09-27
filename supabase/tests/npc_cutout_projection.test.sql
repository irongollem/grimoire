begin;

create extension if not exists pgtap with schema extensions;
select plan(3);

-- npcs.cutout_url (#917, migration 20260927164240) is the NPC's TRUE form on a
-- transparent background. get_player_visible_npcs shows players a concealed
-- NPC's disguise portrait instead of the real one, so the cutout must be
-- withheld too, or it gives the disguise away. And like the portrait, it only
-- reaches players when the DM has shared the portrait field at all.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('91700000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dm917@example.invalid',     '', '{}'::jsonb, '{}'::jsonb),
  ('91700000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'player917@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('91700000-0000-4000-8000-000000000010', '91700000-0000-4000-8000-000000000001', 'Cutout campaign');

insert into public.party_members (id, user_id, campaign_id, name)
values ('91700000-0000-4000-8000-000000000020', '91700000-0000-4000-8000-000000000001', '91700000-0000-4000-8000-000000000010', 'Rosie');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id)
values ('91700000-0000-4000-8000-000000000010', '91700000-0000-4000-8000-000000000002', 'player', 'Player', '91700000-0000-4000-8000-000000000020')
on conflict (campaign_id, user_id) do update set party_member_id = excluded.party_member_id, role = excluded.role;

insert into public.npcs (id, user_id, campaign_id, name, portrait_url, cutout_url, disguise_name, disguise_portrait_url, is_revealed, player_visible_fields, player_visible_to) values
  -- Plain NPC, portrait shared: the cutout comes along.
  ('91700000-0000-4000-8000-000000000031', '91700000-0000-4000-8000-000000000001', '91700000-0000-4000-8000-000000000010',
   'Sister Ribbon', 'https://cdn.example.invalid/ribbon.webp', 'https://cdn.example.invalid/ribbon-cut.webp', null, null, false,
   array['name','portrait'], array['91700000-0000-4000-8000-000000000020'::uuid]),
  -- Disguised and not revealed: players see the disguise, never the true form's cutout.
  ('91700000-0000-4000-8000-000000000032', '91700000-0000-4000-8000-000000000001', '91700000-0000-4000-8000-000000000010',
   'Fondant', 'https://cdn.example.invalid/fondant.webp', 'https://cdn.example.invalid/fondant-cut.webp', 'A Stagehand', 'https://cdn.example.invalid/stagehand.webp', false,
   array['name','portrait'], array['91700000-0000-4000-8000-000000000020'::uuid]),
  -- Portrait not shared: no cutout either.
  ('91700000-0000-4000-8000-000000000033', '91700000-0000-4000-8000-000000000001', '91700000-0000-4000-8000-000000000010',
   'Honeycomb', 'https://cdn.example.invalid/honeycomb.webp', 'https://cdn.example.invalid/honeycomb-cut.webp', null, null, false,
   array['name'], array['91700000-0000-4000-8000-000000000020'::uuid]);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"91700000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select cutout_url from public.get_player_visible_npcs('91700000-0000-4000-8000-000000000010') where id = '91700000-0000-4000-8000-000000000031'),
  'https://cdn.example.invalid/ribbon-cut.webp',
  'a shared portrait brings its cutout to players'
);

select is(
  (select cutout_url from public.get_player_visible_npcs('91700000-0000-4000-8000-000000000010') where id = '91700000-0000-4000-8000-000000000032'),
  null,
  'a concealed NPC''s true-form cutout is withheld, so it cannot give the disguise away'
);

select is(
  (select cutout_url from public.get_player_visible_npcs('91700000-0000-4000-8000-000000000010') where id = '91700000-0000-4000-8000-000000000033'),
  null,
  'no cutout when the portrait is not shared'
);

select * from finish();
rollback;
