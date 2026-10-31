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

-- The shape, total (true or false, never NULL): a site id and, per party member, a square of two numbers.
create function private.is_explore_party(p_party jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when p_party is null then true when jsonb_typeof(p_party) is distinct from 'object' then false else
    coalesce(
      jsonb_typeof(p_party -> 'site_id') = 'string'
      and (p_party ->> 'site_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and jsonb_typeof(p_party -> 'positions') = 'object'
      and (p_party - 'site_id' - 'positions') = '{}'::jsonb
      and coalesce(
        (select bool_and(
            coalesce(
              member ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              and jsonb_typeof(square) = 'object'
              and jsonb_typeof(square -> 'x') = 'number'
              and jsonb_typeof(square -> 'y') = 'number'
              and (square - 'x' - 'y') = '{}'::jsonb,
              false))
           from jsonb_each(p_party -> 'positions') as entry(member, square)),
        true),
      false)
  end;
$$;

alter table public.campaigns add column explore_party jsonb null
  constraint campaigns_explore_party_shape check (private.is_explore_party(explore_party));

-- The site must be a place in this campaign: its id reaches every member who reads the row, so a stray id from
-- another campaign must never be stored.
create function private.guard_explore_party_site()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.explore_party is not null and not exists (
    select 1 from public.locations place
    where place.id = (new.explore_party ->> 'site_id')::uuid and place.campaign_id = new.id
  ) then
    raise exception 'explore_party.site_id must be a place in this campaign' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_explore_party_site() from public, anon, authenticated;

create trigger campaigns_explore_party_site
  before insert or update of explore_party on public.campaigns
  for each row execute procedure private.guard_explore_party_site();

comment on column public.campaigns.explore_party is
  'Where each character stands on a site''s grid while exploring (#1125): { site_id, positions: { party_member_id: { x, y } } } in the site map''s image cells.';
