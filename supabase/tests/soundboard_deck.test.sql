begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

-- The soundboard deck (#1136): pads on a page's eight lanes, a sound pad's
-- takes, and the page's lanes. Each assertion names the guard it protects.

select set_config('grimoire.bypass_quota', 'on', true);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data) values
  ('d3c70000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deck-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('d3c70000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deck-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('d3c70000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'deck-codm@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('d3c70000-0000-4000-8000-000000000010', 'd3c70000-0000-4000-8000-000000000001', 'Deck'),
  ('d3c70000-0000-4000-8000-000000000011', 'd3c70000-0000-4000-8000-000000000001', 'Elsewhere');
insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('d3c70000-0000-4000-8000-000000000010', 'd3c70000-0000-4000-8000-000000000001', 'dm', 'DM'),
  ('d3c70000-0000-4000-8000-000000000011', 'd3c70000-0000-4000-8000-000000000001', 'dm', 'DM'),
  ('d3c70000-0000-4000-8000-000000000010', 'd3c70000-0000-4000-8000-000000000002', 'player', 'Player'),
  ('d3c70000-0000-4000-8000-000000000010', 'd3c70000-0000-4000-8000-000000000003', 'dm', 'Co-DM')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.soundboard_pages (id, campaign_id, user_id, name) values
  ('d3c70000-0000-4000-8000-000000000020', 'd3c70000-0000-4000-8000-000000000010', 'd3c70000-0000-4000-8000-000000000001', 'Mill'),
  ('d3c70000-0000-4000-8000-000000000021', 'd3c70000-0000-4000-8000-000000000011', 'd3c70000-0000-4000-8000-000000000001', 'Elsewhere');
insert into public.sounds (id, user_id, campaign_id, name, category, file_url) values
  ('d3c70000-0000-4000-8000-000000000030', 'd3c70000-0000-4000-8000-000000000001', 'd3c70000-0000-4000-8000-000000000010', 'Door creak', 'effects', 'https://example.invalid/door.mp3'),
  ('d3c70000-0000-4000-8000-000000000031', 'd3c70000-0000-4000-8000-000000000001', 'd3c70000-0000-4000-8000-000000000011', 'Somewhere else', 'effects', 'https://example.invalid/else.mp3');
insert into public.soundboard_playlists (id, campaign_id, user_id, name, playlist_type) values
  ('d3c70000-0000-4000-8000-000000000040', 'd3c70000-0000-4000-8000-000000000010', 'd3c70000-0000-4000-8000-000000000001', 'Tavern', 'ambient');

-- 1-2. The lanes CHECK is total: a page must carry eight well-formed lanes.
select throws_ok(
  $$update public.soundboard_pages set lanes = '[{"name":"Music","rule":"one"}]'::jsonb
     where id = 'd3c70000-0000-4000-8000-000000000020'$$,
  '23514', null,
  'a page with fewer than eight lanes is refused');
select throws_ok(
  $$update public.soundboard_pages
       set lanes = jsonb_set(lanes, '{0}', '{"name":"Music"}'::jsonb)
     where id = 'd3c70000-0000-4000-8000-000000000020'$$,
  '23514', null,
  'a lane with no rule is refused (a missing key is false, not NULL)');

-- 3. Positive control: the DM lays out a sound pad and a scene pad.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"d3c70000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.soundboard_pads (id, campaign_id, user_id, page_id, lane, grid_row)
    values ('d3c70000-0000-4000-8000-000000000050', 'd3c70000-0000-4000-8000-000000000010',
            'd3c70000-0000-4000-8000-000000000001', 'd3c70000-0000-4000-8000-000000000020', 3, 0);
    insert into public.soundboard_pad_takes (pad_id, sound_id)
    values ('d3c70000-0000-4000-8000-000000000050', 'd3c70000-0000-4000-8000-000000000030');
    insert into public.soundboard_pads (id, campaign_id, user_id, page_id, lane, grid_row, playlist_id)
    values ('d3c70000-0000-4000-8000-000000000051', 'd3c70000-0000-4000-8000-000000000010',
            'd3c70000-0000-4000-8000-000000000001', 'd3c70000-0000-4000-8000-000000000020', 1, 0,
            'd3c70000-0000-4000-8000-000000000040')$$,
  'the DM can lay out a sound pad with a take and a scene pad');

-- 4. Two pads cannot share a slot.
select throws_ok(
  $$insert into public.soundboard_pads (campaign_id, user_id, page_id, lane, grid_row)
    values ('d3c70000-0000-4000-8000-000000000010', 'd3c70000-0000-4000-8000-000000000001',
            'd3c70000-0000-4000-8000-000000000020', 3, 0)$$,
  '23505', null,
  'a second pad in an occupied slot is refused');

-- 5. guard_pad_take_campaign: a pad plays only its own campaign's sounds, even
--    a sound the writer can read in another campaign they run.
select throws_ok(
  $$insert into public.soundboard_pad_takes (pad_id, sound_id)
    values ('d3c70000-0000-4000-8000-000000000050', 'd3c70000-0000-4000-8000-000000000031')$$,
  '23514', null,
  'a take from another campaign is refused');

-- guard_pad_take_campaign: only a sound pad has takes.
select throws_ok(
  $$insert into public.soundboard_pad_takes (pad_id, sound_id)
    values ('d3c70000-0000-4000-8000-000000000051', 'd3c70000-0000-4000-8000-000000000030')$$,
  '23514', null,
  'a take on a scene pad is refused');

-- guard_pad_campaign_fixed: a pad cannot carry its takes into another campaign,
-- even for a DM of both moving it together with a page there (which the shared
-- same-campaign trigger alone would let through).
select throws_ok(
  $$update public.soundboard_pads
       set campaign_id = 'd3c70000-0000-4000-8000-000000000011',
           page_id = 'd3c70000-0000-4000-8000-000000000021'
     where id = 'd3c70000-0000-4000-8000-000000000050'$$,
  '23514', null,
  'a pad cannot move to another campaign');

-- move_soundboard_pad: dropping a pad on an occupied slot swaps the two.
select public.move_soundboard_pad('d3c70000-0000-4000-8000-000000000050', 'd3c70000-0000-4000-8000-000000000020', 1, 0);
select results_eq(
  $$select id::text, lane::integer, grid_row::integer from public.soundboard_pads
     where page_id = 'd3c70000-0000-4000-8000-000000000020' order by lane$$,
  $$values ('d3c70000-0000-4000-8000-000000000050', 1, 0), ('d3c70000-0000-4000-8000-000000000051', 3, 0)$$,
  'moving a pad onto another swaps them');

-- 6-7. A player sees no pads and cannot write one.
select set_config('request.jwt.claims', '{"sub":"d3c70000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.move_soundboard_pad('d3c70000-0000-4000-8000-000000000050', 'd3c70000-0000-4000-8000-000000000020', 5, 5)$$,
  'P0002', null,
  'a player cannot move a pad (it is not theirs to see)');
select is_empty(
  $$select id from public.soundboard_pads where campaign_id = 'd3c70000-0000-4000-8000-000000000010'$$,
  'a player cannot read the deck');
select throws_ok(
  $$insert into public.soundboard_pads (campaign_id, user_id, page_id, lane, grid_row)
    values ('d3c70000-0000-4000-8000-000000000010', 'd3c70000-0000-4000-8000-000000000002',
            'd3c70000-0000-4000-8000-000000000020', 0, 5)$$,
  '42501', null,
  'a player cannot add a pad');

-- The takes are not a side door: a co-DM may not delete another DM's pad, so
-- may not empty it of takes either (drop_empty_sound_pad would then delete it
-- with definer rights).
select set_config('request.jwt.claims', '{"sub":"d3c70000-0000-4000-8000-000000000003","role":"authenticated"}', true);
delete from public.soundboard_pad_takes where pad_id = 'd3c70000-0000-4000-8000-000000000050';
select set_config('request.jwt.claims', '{"sub":"d3c70000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select isnt_empty(
  $$select id from public.soundboard_pad_takes where pad_id = 'd3c70000-0000-4000-8000-000000000050'$$,
  'a co-DM cannot strip another DM''s pad of its takes');
select isnt_empty(
  $$select id from public.soundboard_pads where id = 'd3c70000-0000-4000-8000-000000000050'$$,
  'so the pad survives the co-DM''s attempt');

-- 8-9. drop_empty_sound_pad: deleting a sound pad's only sound removes the pad,
--      and leaves a scene pad alone.
select set_config('request.jwt.claims', '{"sub":"d3c70000-0000-4000-8000-000000000001","role":"authenticated"}', true);
delete from public.sounds where id = 'd3c70000-0000-4000-8000-000000000030';
select is_empty(
  $$select id from public.soundboard_pads where id = 'd3c70000-0000-4000-8000-000000000050'$$,
  'a sound pad whose last take is gone goes with it');
select isnt_empty(
  $$select id from public.soundboard_pads where id = 'd3c70000-0000-4000-8000-000000000051'$$,
  'a scene pad has no takes and stays');

select * from finish();
rollback;
