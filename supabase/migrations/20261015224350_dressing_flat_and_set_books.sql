-- Migration: dressing_flat_and_set_books
-- Dressing learns which props lie flat, gains two groups, and gets the first tile-set book (#1065).
--
-- 1. `flat`. The Cartographer now draws shadows itself, from what stands up (#1065 decision 3):
--    ambient occlusion plus a cast shadow away from a top-left light. A prop that lies on the
--    floor (a rug, a bloodstain, a heap of bones, a body) must not cast one: an offset shadow
--    lifts it off the ground, which the maintainer saw on the first sewer map ("some seem to
--    float because of it"). Flat props get only the occlusion rim where they meet the floor.
--    Default false: standing is the common case, and a new prop that is wrongly standing reads
--    as a slightly heavy shadow, never as something hovering.
-- 2. Groups `crossings` (bridges, walkways, gratings laid over water) and `vermin` (nests,
--    burrows, gnawed bones, a rat warren's leavings). Both arrive with the tile sets: a set must
--    be able to build a whole map (#1065 decision 4), and a sewer needs its bridges and its rats.
-- 3. One Dressing book per tile set, opt-in per source like every library (book icon, starts
--    off). The first is the Sewers; each repainted set adds its own. Titled "Grimoire <Area>" with
--    the publisher "Dungeon Grimoire", as 20261014100306 settled for our own books.

-- ── 1. Flat props ────────────────────────────────────────────────────────────
alter table public.library_dressing add column flat boolean not null default false;

update public.library_dressing set flat = true
 where id in (
   'dressing_rug', 'dressing_bloodstain', 'dressing_scattered_bones', 'dressing_skeleton',
   'dressing_fallen_adventurer', 'dressing_fallen_robed_figure', 'dressing_beast_carcass',
   'dressing_coin_pile', 'dressing_weapon_pile', 'dressing_summoning_circle', 'dressing_bedroll',
   'dressing_chains', 'dressing_straw_pallet'
 );

-- ── 2. Groups ────────────────────────────────────────────────────────────────
alter table public.library_dressing drop constraint library_dressing_group_key_check;
alter table public.library_dressing add constraint library_dressing_group_key_check check (group_key = any (array[
  'furniture', 'containers', 'loot', 'remains', 'tavern', 'workshop',
  'arcane', 'religious', 'camp', 'prison', 'outdoor', 'crossings', 'vermin']));

-- ── 3. The Sewers book ───────────────────────────────────────────────────────
insert into public.content_sources (key, open5e_key, title, publisher, license_keys, copyright_notice, product_url, gamesystem, is_redistributable, is_metadata_curated, sort_order)
values ('grimoire-dressing-sewers', null, 'Grimoire Sewers', 'Dungeon Grimoire', '{}',
  'Original top-down sewer props drawn for Dungeon Grimoire: bridges, walkways and the leavings of rat warrens. Not from any published book.',
  null, null, true, true, 87)
on conflict (key) do nothing;
