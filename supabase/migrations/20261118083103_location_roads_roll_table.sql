-- A road's own encounter table (#1222, story 7).
--
-- A roll table can be placed on a place (`location_placements.roll_table_id`), and a road is not a place: "the
-- High Road" runs between towns and its dangers belong to the road, not to either end. So a road may name one
-- table. On delete of the table the road simply has none again; the table must be of the road's campaign, or a
-- campaign-less table of someone who may use it there (the same rule as every reference to a roll table).

alter table public.location_roads
  add column roll_table_id uuid references public.roll_tables(id) on delete set null;

create index location_roads_roll_table_idx on public.location_roads (roll_table_id);

-- The guard names every reference, so it is made again with the new one.
drop trigger zz_same_campaign_refs on public.location_roads;
create trigger zz_same_campaign_refs
  before insert or update of from_location_id, to_location_id, roll_table_id, campaign_id
  on public.location_roads
  for each row execute procedure private.enforce_same_campaign_refs(
    'from_location_id', 'locations', 'owned',
    'to_location_id', 'locations', 'owned',
    'roll_table_id', 'roll_tables', 'owned');
