-- An Entrance zone (#1125, Map Table frame 19): where the party walks in when
-- the DM explores a site. It replaces a separate "party start" setting: the
-- editor's Zoning tab already draws zones, and Explore seats an unplaced party
-- inside the site's entrance zone, or on the map's centre when there is none.
-- The kind list stays closed for the reason the original check gives: the
-- renderer must be able to draw any value, whatever pack is loaded.
alter table public.location_map_regions
  drop constraint location_map_regions_zone_kind_check,
  add constraint location_map_regions_zone_kind_check
    check (zone_kind is null or zone_kind in ('terrain', 'hazard', 'light', 'trigger', 'marker', 'entrance'));
