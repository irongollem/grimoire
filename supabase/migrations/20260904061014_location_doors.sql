-- Room flow. Story #785, epic #780.
--
-- `parent_id` says a room is inside a site. Nothing says a room connects to
-- another room, so "the nave opens onto the reliquary, but the abbot's cell is
-- barred from the outside" lives only in the DM's head. `related_location_ids`
-- is not that mechanism and is not being made into one: it is a bare uuid[]
-- with no meaning to its order, no type and no direction, and it earns its keep
-- at map scale for trade routes, tunnels and connected districts. A crawl needs
-- direction, a name, and a reason a door will not open.
--
-- Scoped to rooms inside one site rather than the whole Atlas, so this stays a
-- floor-plan feature and does not quietly become a general graph over every
-- place in the world.
--
-- DELIBERATELY AUTHORED STATE ONLY. `starts_locked` and `is_secret` are what
-- the DM prepared; whether the party has since opened or found it is *play*
-- state and belongs to the durable-site-state log in #787, keyed on the room.
-- Putting a live `is_locked` here would give that fact two homes, one of them
-- without provenance or undo — which is the shape this epic exists to remove.

create table public.location_doors (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,

  from_location_id   uuid not null references public.locations(id) on delete cascade,
  to_location_id     uuid not null references public.locations(id) on delete cascade,

  -- "iron grille", "collapsed stair", "barred door". Free text on purpose: an
  -- enum of passage kinds is a taxonomy nobody asked for, and the label is read
  -- aloud rather than branched on.
  label              text not null default '',

  -- false: passable both ways. true: from -> to only (a one-way chute, a door
  -- that bars from the far side).
  is_one_way         boolean not null default false,

  -- Authored prep, not live state. See the header.
  starts_locked      boolean not null default false,
  -- What opens it: "the brass key", "DC 15 thieves' tools".
  lock_note          text,
  -- A door the party cannot see until they find it.
  is_secret          boolean not null default false,

  sort_order         integer,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint location_doors_not_self check (from_location_id <> to_location_id)
);

comment on table public.location_doors is
  'Named, directional connections between rooms inside one site. Authored prep only - whether a door has since been unlocked or found is play state and belongs to #787.';

create index location_doors_from_idx on public.location_doors (from_location_id);
create index location_doors_to_idx   on public.location_doors (to_location_id);

-- Two rooms may legitimately have two connections — a main door and a secret
-- passage — so the pair alone is not unique. The label distinguishes them, the
-- same way quest_beat_edges allows a repeated pair under different labels.
create unique index location_doors_unique_route
  on public.location_doors (from_location_id, to_location_id, label);

create trigger location_doors_updated_at
  before update on public.location_doors
  for each row execute procedure update_updated_at();

-- Both ends must be rooms in the same site. Without this a "door" could join
-- two rooms in different dungeons, or a room to a continent, and every consumer
-- would have to re-derive what a valid connection is — which is precisely the
-- hole `quest_beat_attachments.metadata.room_ids` left by validating only that
-- an id existed.
create function public.guard_location_door_endpoints()
returns trigger
language plpgsql
set search_path = public, private
as $$
declare
  v_from_parent uuid;
  v_to_parent   uuid;
  v_from_type   public.location_type_enum;
  v_to_type     public.location_type_enum;
begin
  select parent_id, location_type into v_from_parent, v_from_type
    from public.locations where id = new.from_location_id;
  select parent_id, location_type into v_to_parent, v_to_type
    from public.locations where id = new.to_location_id;

  if v_from_type is distinct from 'room' or v_to_type is distinct from 'room' then
    raise exception 'A door connects two rooms' using errcode = '23514';
  end if;

  if v_from_parent is null or v_from_parent is distinct from v_to_parent then
    raise exception 'A door connects two rooms inside the same place'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke execute on function public.guard_location_door_endpoints() from public, anon, authenticated;

create trigger location_doors_endpoint_guard
  before insert or update of from_location_id, to_location_id
  on public.location_doors
  for each row execute procedure public.guard_location_door_endpoints();

alter table public.location_doors enable row level security;

-- Same live shape as location_placements and puzzle_rooms: owner-scoped read
-- and write, and creating one additionally requires being DM of the campaign
-- the rooms belong to. No campaign_id column — `locations` owns that fact.
create policy "location_doors_select" on public.location_doors
  for select using ((select auth.uid()) = user_id);

create policy "location_doors_insert" on public.location_doors
  for insert with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.locations l
      where l.id = from_location_id
        and (l.campaign_id is null or private.is_campaign_dm(l.campaign_id))
    )
  );


-- `with check` is not optional here, and its absence is the exact hole
-- 20260828210805 exists to close. Without it Postgres reuses USING as the
-- check, which pins `user_id` but leaves the location pointer free — so a user
-- who cannot INSERT against someone else's site can still create a row on their
-- own and then UPDATE it to point there. The tables this migration says it
-- mirrors (`puzzle_rooms`, `traps`) both carry the check; they key it on their
-- own `campaign_id` column, which these tables deliberately do not have, so it
-- is restated here as the same join the INSERT policy uses.
--
-- Doors are protected in practice by `guard_location_door_endpoints`, which
-- fires on `update of from_location_id, to_location_id` and fails closed on a
-- row RLS cannot see. That is protection by accident of another feature, which
-- is not a thing to rely on.
create policy "location_doors_update" on public.location_doors
  for update
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.locations l
      where l.id = from_location_id
        and (l.campaign_id is null or private.is_campaign_dm(l.campaign_id))
    )
  );

create policy "location_doors_delete" on public.location_doors
  for delete using ((select auth.uid()) = user_id);
