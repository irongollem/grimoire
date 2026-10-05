begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

-- unmasked_at (20261005220516): the moment a disguised NPC's true self was
-- revealed, and the cover the party knew, handed to players only once the
-- disguise has fallen.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('95500000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unmask-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('95500000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unmask-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('95500000-0000-4000-8000-000000000010', '95500000-0000-4000-8000-000000000001', 'Masks');

insert into public.party_members (id, user_id, campaign_id, name, ruleset)
values ('95500000-0000-4000-8000-000000000030', '95500000-0000-4000-8000-000000000002', '95500000-0000-4000-8000-000000000010', 'Wren', '2014');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('95500000-0000-4000-8000-000000000010', '95500000-0000-4000-8000-000000000001', 'dm', 'The DM', null),
  ('95500000-0000-4000-8000-000000000010', '95500000-0000-4000-8000-000000000002', 'player', 'Player', '95500000-0000-4000-8000-000000000030')
on conflict (campaign_id, user_id) do update set role = excluded.role, party_member_id = excluded.party_member_id;

-- Mara is Seraphine in disguise, name shared. Hood is disguised too, but the
-- name field is not shared with the party.
insert into public.npcs (id, user_id, campaign_id, name, disguise_name, is_revealed, player_visible_to, player_visible_fields) values
  ('95500000-0000-4000-8000-000000000020', '95500000-0000-4000-8000-000000000001', '95500000-0000-4000-8000-000000000010',
   'Seraphine Vael', 'Mara Hollowell', false, array['95500000-0000-4000-8000-000000000030']::uuid[], array['name', 'portrait']),
  ('95500000-0000-4000-8000-000000000021', '95500000-0000-4000-8000-000000000001', '95500000-0000-4000-8000-000000000010',
   'The Duke', 'A hooded man', false, array['95500000-0000-4000-8000-000000000030']::uuid[], array['portrait']);

create function pg_temp.seen(p_id uuid) returns public.npcs language sql as $$
  select p from public.get_player_visible_npcs('95500000-0000-4000-8000-000000000010') p where p.id = p_id
$$;

-- ── Still disguised ────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', '95500000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select (s).name || '|' || coalesce((s).disguise_name, 'none') || '|' || coalesce((s).unmasked_at::text, 'none')
     from (select pg_temp.seen('95500000-0000-4000-8000-000000000020') as s) x),
  'Mara Hollowell|none|none',
  'a disguised NPC comes back under its cover, with no cover column and no unmask time');

-- ── The DM reveals both ────────────────────────────────────────────────────
reset role;
update public.npcs set is_revealed = true
 where id in ('95500000-0000-4000-8000-000000000020', '95500000-0000-4000-8000-000000000021');

select isnt(
  (select unmasked_at from public.npcs where id = '95500000-0000-4000-8000-000000000020'),
  null, 'revealing a disguise stamps unmasked_at');

set local role authenticated;
select set_config('request.jwt.claim.sub', '95500000-0000-4000-8000-000000000002', true);

select is(
  (select (s).name || '|' || (s).disguise_name
     from (select pg_temp.seen('95500000-0000-4000-8000-000000000020') as s) x),
  'Seraphine Vael|Mara Hollowell',
  'once unmasked, the player gets the true name and the cover they knew');

select isnt(
  (select (s).unmasked_at from (select pg_temp.seen('95500000-0000-4000-8000-000000000020') as s) x),
  null, 'and the moment it fell');

select is(
  (select (s).is_revealed from (select pg_temp.seen('95500000-0000-4000-8000-000000000020') as s) x),
  false, 'is_revealed itself still never leaves the DM');

select is(
  (select coalesce((s).disguise_name, 'none') from (select pg_temp.seen('95500000-0000-4000-8000-000000000021') as s) x),
  'none', 'an NPC whose name is not shared gives no cover name either');

-- ── The DM puts the disguise back on ───────────────────────────────────────
reset role;
update public.npcs set is_revealed = false where id = '95500000-0000-4000-8000-000000000020';

select is(
  (select unmasked_at from public.npcs where id = '95500000-0000-4000-8000-000000000020'),
  null, 'putting the disguise back clears unmasked_at, so a second reveal turns again');

-- An unrelated edit to an unmasked NPC keeps its moment.
update public.npcs set is_revealed = true where id = '95500000-0000-4000-8000-000000000020';
update public.npcs set unmasked_at = '2020-01-01T00:00:00Z' where id = '95500000-0000-4000-8000-000000000020';
update public.npcs set occupation = 'Spy' where id = '95500000-0000-4000-8000-000000000020';

select is(
  (select unmasked_at from public.npcs where id = '95500000-0000-4000-8000-000000000020'),
  '2020-01-01T00:00:00Z'::timestamptz, 'an unrelated edit does not move the moment');

select * from finish();
rollback;
