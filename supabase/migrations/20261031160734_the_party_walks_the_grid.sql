-- The party walks the grid while exploring (#1125 decision 9, canvas frame 09).
--
-- Exploring a site runs on the same Play screen as a fight: the party's tokens stand on the site's map and move
-- together, square by square, and stepping into an unexplored room asks the DM whether to reveal it. Where the party
-- is as a ROOM stays `campaigns.current_location_id` (its arrival trigger records the room explored, as before); this
-- column adds where each character stands on the grid, which only exploring needs:
--
--   explore_party = { site_id: uuid, positions: { <party member id>: { x, y } } }
--
-- in the site map's image cells, the space tokens use in a fight, so a fight started here can stand everyone where
-- they were. One site at a time: walking into another site replaces it. It lives on the campaign row because that
-- row already rings the campaign and every member reads it; the DM writes it like the rest of the row.

alter table public.campaigns add column explore_party jsonb null
  constraint campaigns_explore_party_shape check (
    explore_party is null or (
      jsonb_typeof(explore_party) = 'object'
      and jsonb_typeof(explore_party -> 'site_id') = 'string'
      and (explore_party ->> 'site_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and jsonb_typeof(explore_party -> 'positions') = 'object'
    )
  );

comment on column public.campaigns.explore_party is
  'Where each character stands on a site''s grid while exploring (#1125): { site_id, positions: { party_member_id: { x, y } } } in the site map''s image cells.';
