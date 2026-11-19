-- Roads between places (#1222, story 1).
--
-- A D&D book says in a town's entry how far it is to the towns its roads lead to: "Brightwater, 40 miles by the coast
-- road". Until now the app had nowhere to keep that, so moving the party between two places was one step with no
-- distance and no days. A road is a row joining two places (maintainer, 18 Nov 2026: "perhaps a road is a joining
-- table between two locations"): the two places, how far, and optionally its name and what kind of going it is.
--
-- * It needs no map. A distance measured on a scaled map is only the fallback (story 2).
-- * It reads from both ends: a road from A to B is the road from B to A. The two ids are stored in one order
--   (`location_roads_normalize` puts the smaller id first), and one pair holds one road of each name
--   (`location_roads_one_per_name`), so a road cannot be entered twice by swapping the ends.
-- * One pair of places may have more than one road (the coast road and the pass), told apart by name.
-- * The World Web holds no copy: it draws a road as the line between its two places, read from here.
--
-- Access is by campaign role, like world_links: a co-DM edits the roads a fellow DM drew. Players do not read this
-- table; what they see of a road will be a projection that applies both places' visibility (a later story).

create table public.location_roads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  from_location_id uuid not null references public.locations (id) on delete cascade,
  to_location_id uuid not null references public.locations (id) on delete cascade,
  -- How far, in `unit`. A world is big, but not this big: the ceiling catches a slipped decimal.
  distance numeric(9, 2) not null check (distance > 0 and distance <= 100000),
  unit text not null default 'mi' check (unit in ('mi', 'km')),
  -- "the coast road"; empty when the road has no name.
  name text not null default '' check (char_length(name) <= 120),
  -- What kind of going it is: decides the pace later, and how the line is drawn.
  going text not null default 'road' check (going in ('road', 'track', 'river', 'sea')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_roads_two_places check (from_location_id <> to_location_id),
  -- Checked after `location_roads_normalize` has put the ends in order and trimmed the name, so "B to A" is refused
  -- where "A to B" of that name already stands. Two roads between one pair are told apart by name, an unnamed one
  -- included. The places' campaign is the road's (`zz_same_campaign_refs`), so the pair already implies it.
  constraint location_roads_one_per_name unique (from_location_id, to_location_id, name)
);

comment on table public.location_roads is
  'A road between two places of a campaign, with its distance: the source of travel distances. Reads from both ends; the ids are stored smaller first.';

create index location_roads_campaign_id_idx on public.location_roads (campaign_id);
-- `from_location_id` is led by the unique constraint's index.
create index location_roads_to_location_id_idx on public.location_roads (to_location_id);
create index location_roads_user_id_idx on public.location_roads (user_id);

create trigger location_roads_updated_at
  before update on public.location_roads
  for each row execute procedure update_updated_at();

-- One order for the two ends, so "A to B" and "B to A" are the same row to every reader and every index.
create or replace function public.location_roads_normalize()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_swap uuid;
begin
  if new.from_location_id > new.to_location_id then
    v_swap := new.from_location_id;
    new.from_location_id := new.to_location_id;
    new.to_location_id := v_swap;
  end if;
  new.name := btrim(new.name);
  return new;
end;
$$;

revoke execute on function public.location_roads_normalize() from public, anon, authenticated;

create trigger location_roads_normalize
  before insert or update of from_location_id, to_location_id, name on public.location_roads
  for each row execute procedure public.location_roads_normalize();

-- Who drew a road stays who drew it, and it stays in its campaign.
create trigger location_roads_guard_content_author
  before update on public.location_roads
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();

-- Both places are of the road's own campaign.
create trigger zz_same_campaign_refs
  before insert or update of from_location_id, to_location_id, campaign_id
  on public.location_roads
  for each row execute procedure private.enforce_same_campaign_refs(
    'from_location_id', 'locations', 'owned',
    'to_location_id', 'locations', 'owned');

alter table public.location_roads enable row level security;
create policy "location_roads_select" on public.location_roads for select using (private.is_campaign_dm(campaign_id));
create policy "location_roads_insert" on public.location_roads for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "location_roads_update" on public.location_roads for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "location_roads_delete" on public.location_roads for delete using (private.is_campaign_dm(campaign_id));

grant select, insert, update, delete on public.location_roads to authenticated, service_role;

-- Live: a road added on one screen shows on the other DM's.
create trigger location_roads_signal_insert after insert on public.location_roads
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger location_roads_signal_update after update on public.location_roads
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger location_roads_signal_delete after delete on public.location_roads
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

-- The demo campaign's roads are copied with it, like its other ties between records.
insert into private.demo_campaign_tables (table_name, tier, copy, reason) values ('location_roads', 1, true, null);
