-- Migration: dungeon_map_darkness
-- A map's darkness level: daylight, dim or dark (#1073, story 3).
--
-- The maintainer, 16 Oct 2026: "when a cave or other sort of tileset feels too light we can darken it ... but the light
-- layer interacts with that". The level is the rules' own: daylight is bright light everywhere, dim is dim light
-- everywhere (lightly obscured, as at twilight or under a full moon), dark is darkness wherever no light reaches. It is
-- set in the Cartographer with the drawing and reaches play through the published snapshot (`locations.map_live`), so a
-- change to it counts as a change to the drawing: the rev trigger now watches it too, and a site published before the
-- change reads as out of date until it is published again.

alter table public.dungeon_maps add column darkness text not null default 'daylight'
  constraint dungeon_maps_darkness_level check (darkness in ('daylight', 'dim', 'dark'));

comment on column public.dungeon_maps.darkness is
  'The map''s darkness level (#1073): daylight, dim or dark, as the rules define bright light, dim light and darkness. Published into locations.map_live.';

create or replace function public.bump_dungeon_map_rev()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  -- Only what a publish carries counts: the drawing, and the darkness it is played in. Renaming a map or retagging it
  -- does not make a published site stale, so those saves leave the rev alone.
  if new.layers is distinct from old.layers
    or new.metadata is distinct from old.metadata
    or new.darkness is distinct from old.darkness then
    new.rev := old.rev + 1;
  end if;
  return new;
end;
$function$;

drop trigger dungeon_maps_bump_rev on public.dungeon_maps;
create trigger dungeon_maps_bump_rev
  before update of layers, metadata, darkness on public.dungeon_maps
  for each row execute procedure public.bump_dungeon_map_rev();
