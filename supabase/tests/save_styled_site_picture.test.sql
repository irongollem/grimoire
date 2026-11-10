begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

-- save_styled_site_picture (20261109181107, #1169): a styled render's walls drawing and the place's switch to it
-- are one write. Proven here: the save makes one map and points the place at it; the same key again reuses that map
-- instead of making another; a place the caller may not change refuses the whole save, leaving no map behind; and
-- the function runs as the caller (no definer), so a stranger gets nothing.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('11690000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sss-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('11690000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sss-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name) values
  ('11690000-0000-4000-8000-000000000010', '11690000-0000-4000-8000-000000000001', 'The Styled Keep');

insert into public.campaign_members (campaign_id, user_id, role, display_name) values
  ('11690000-0000-4000-8000-000000000010', '11690000-0000-4000-8000-000000000002', 'player', 'Player')
on conflict (campaign_id, user_id) do update set role = excluded.role;

insert into public.locations (id, user_id, campaign_id, name) values
  ('11690000-0000-4000-8000-000000000020', '11690000-0000-4000-8000-000000000001', '11690000-0000-4000-8000-000000000010', 'Keep');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── The DM saves a render ───────────────────────────────────────────────────────

select set_config('request.jwt.claim.sub', '11690000-0000-4000-8000-000000000001', true);
select lives_ok($$
  select public.save_styled_site_picture(
    '11690000-0000-4000-8000-000000000020', '11690000-0000-4000-8000-0000000000a1', 'https://example.invalid/styled.webp',
    '{"cells_per_image_width": 20, "origin_x_pct": 0, "origin_y_pct": 0}'::jsonb, '{"version": 3}'::jsonb,
    '{"name": "Keep walls", "darkness": "dim", "campaign_id": "11690000-0000-4000-8000-000000000010", "layers": {}}'::jsonb)
$$, 'the DM saves a styled render');

select is(
  (select count(*)::int from public.dungeon_maps where metadata ->> 'styled_save_request' = '11690000-0000-4000-8000-0000000000a1'),
  1, 'the save makes one walls drawing, carrying its key');

select is(
  (select l.source_map_id from public.locations l where l.id = '11690000-0000-4000-8000-000000000020'),
  (select m.id from public.dungeon_maps m where m.metadata ->> 'styled_save_request' = '11690000-0000-4000-8000-0000000000a1'),
  'the place now draws from that walls drawing');

select is(
  (select map_url from public.locations where id = '11690000-0000-4000-8000-000000000020'),
  'https://example.invalid/styled.webp', 'the render is the place''s Picture');

-- ── The same render again: a retry whose first answer was lost ─────────────────

select lives_ok($$
  select public.save_styled_site_picture(
    '11690000-0000-4000-8000-000000000020', '11690000-0000-4000-8000-0000000000a1', 'https://example.invalid/styled-2.webp',
    '{"cells_per_image_width": 20, "origin_x_pct": 0, "origin_y_pct": 0}'::jsonb, '{"version": 3}'::jsonb,
    '{"name": "Keep walls", "darkness": "dim", "campaign_id": "11690000-0000-4000-8000-000000000010", "layers": {}}'::jsonb)
$$, 'the same key saves again');

select is(
  (select count(*)::int from public.dungeon_maps where user_id = '11690000-0000-4000-8000-000000000001'),
  1, 'the same key reuses its map: still one walls drawing');

-- ── A place the caller may not change refuses the whole save ────────────────────

select set_config('request.jwt.claim.sub', '11690000-0000-4000-8000-000000000002', true);
select throws_ok($$
  select public.save_styled_site_picture(
    '11690000-0000-4000-8000-000000000020', '11690000-0000-4000-8000-0000000000b2', 'https://example.invalid/mine.webp',
    '{}'::jsonb, '{}'::jsonb, '{"name": "Player walls", "layers": {}}'::jsonb)
$$, '42501', null, 'a player cannot restyle the DM''s place');

select is(
  (select count(*)::int from public.dungeon_maps where metadata ->> 'styled_save_request' = '11690000-0000-4000-8000-0000000000b2'),
  0, 'the refused save leaves no walls drawing behind');

reset role;
select is(
  (select map_url from public.locations where id = '11690000-0000-4000-8000-000000000020'),
  'https://example.invalid/styled-2.webp', 'the refused save left the place as it was');

select * from finish();
rollback;
