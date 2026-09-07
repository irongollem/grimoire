begin;

create extension if not exists pgtap with schema extensions;
select plan(7);

-- A creature's challenge rating is withheld from players until the DM reveals
-- its stats. Decided by the maintainer, 7 Sep 2026, when #842 surfaced that the
-- code and its own comment disagreed:
--
--   `reveal_stats: boolean;  // false = name/art/CR only; true = full stat block`
--
-- The projection has always nulled the whole `stat_block`, and the CR lives
-- inside it — so players have never seen a CR before the reveal. The comment
-- was wrong, not the behaviour. **CR is a spoiler**, and the bestiary shows
-- "CR ???" for an unrevealed creature.
--
-- Pinned here rather than left to that comment, because the failure mode is
-- silent in both directions: widening the projection to pass a CR through
-- would leak it with nothing failing, and the crash that led here (#842, three
-- users) came from a UI that assumed the stat block was present. A test is the
-- only thing that notices either.

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data)
values
  ('84200000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reveal-dm@example.invalid', '', '{}'::jsonb, '{}'::jsonb),
  ('84200000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'reveal-player@example.invalid', '', '{}'::jsonb, '{}'::jsonb);

insert into public.campaigns (id, user_id, name)
values ('84200000-0000-4000-8000-000000000010', '84200000-0000-4000-8000-000000000001', 'Reveal campaign');

insert into public.party_members (id, user_id, owner_user_id, campaign_id, name)
values ('84200000-0000-4000-8000-000000000020', '84200000-0000-4000-8000-000000000001', '84200000-0000-4000-8000-000000000002', '84200000-0000-4000-8000-000000000010', 'A hero');

insert into public.campaign_members (campaign_id, user_id, role, display_name, party_member_id) values
  ('84200000-0000-4000-8000-000000000010', '84200000-0000-4000-8000-000000000001', 'dm', 'Reveal DM', null),
  ('84200000-0000-4000-8000-000000000010', '84200000-0000-4000-8000-000000000002', 'player', 'Reveal player', '84200000-0000-4000-8000-000000000020')
on conflict (campaign_id, user_id) do update
set role = excluded.role, display_name = excluded.display_name, party_member_id = excluded.party_member_id;

-- A CR the assertions below can look for by value: if it ever reaches a player
-- before the reveal, the test can say so rather than merely observing a
-- non-null stat block.
insert into public.monsters (id, user_id, campaign_id, name, monster_type, image_url, stat_block)
values (
  '84200000-0000-4000-8000-000000000030', '84200000-0000-4000-8000-000000000001',
  '84200000-0000-4000-8000-000000000010', 'The Withheld Thing', 'aberration', 'https://example.invalid/art.webp',
  '{"challenge_rating": "13", "armor_class": 17, "hit_points": "180"}'::jsonb
);

-- `visible_to` null = discovered by the whole party.
insert into public.discovered_monsters (id, campaign_id, monster_id, visible_to, reveal_stats)
values ('84200000-0000-4000-8000-000000000040', '84200000-0000-4000-8000-000000000010', '84200000-0000-4000-8000-000000000030', null, false);

set local role authenticated;
select set_config('request.jwt.claim.sub', '84200000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── Withheld ───────────────────────────────────────────────────────────────

select is(
  (select count(*)::integer from public.get_player_visible_monsters('84200000-0000-4000-8000-000000000010')),
  1, 'a discovered creature reaches the player at all'
);

select is(
  (select name from public.get_player_visible_monsters('84200000-0000-4000-8000-000000000010')),
  'The Withheld Thing', 'its name is not withheld — the party met it'
);

select is(
  (select image_url from public.get_player_visible_monsters('84200000-0000-4000-8000-000000000010')),
  'https://example.invalid/art.webp', 'nor its art'
);

select ok(
  (select stat_block is null from public.get_player_visible_monsters('84200000-0000-4000-8000-000000000010')),
  'but the stat block is withheld whole'
);

-- The point of this file. A future change that passes "just the CR" through —
-- which the old comment invited — fails here.
select ok(
  (select stat_block ->> 'challenge_rating' is null
     from public.get_player_visible_monsters('84200000-0000-4000-8000-000000000010')),
  'and the challenge rating with it: CR is a spoiler until the DM reveals stats'
);

-- ── Revealed ───────────────────────────────────────────────────────────────
--
-- The other half, so a projection that denied everything could not pass this
-- file while silently breaking the feature.

reset role;
update public.discovered_monsters set reveal_stats = true
where id = '84200000-0000-4000-8000-000000000040';

set local role authenticated;
select set_config('request.jwt.claim.sub', '84200000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select stat_block ->> 'challenge_rating' from public.get_player_visible_monsters('84200000-0000-4000-8000-000000000010')),
  '13', 'once the DM reveals stats, the CR comes through'
);

select is(
  (select stat_block ->> 'armor_class' from public.get_player_visible_monsters('84200000-0000-4000-8000-000000000010')),
  '17', 'along with the rest of the block'
);

select * from finish();
rollback;
