-- Prep material gets a place. Story #788, epic #780.
--
-- Today only puzzles can say where they are (`puzzle_rooms.location_id`,
-- 20260720000002). Traps, dungeon features, roll tables and loot tables carry no
-- location at all, so a corridor cannot have a trap in it: a trap reaches play
-- only through `encounters.trap_ids`, which means it needs a *fight* to exist.
--
-- This is a join table rather than the `location_id` column the ticket first
-- proposed, and the reason is in the data. `encounters.trap_ids` is a `uuid[]`,
-- so traps are already reusable across encounters; `dungeon_features` has no
-- `campaign_id` at all, because it is a user-scoped catalogue of reusable
-- fixtures. A column would force one placement per template and quietly make a
-- reusable thing single-use. Placing a catalogue entry somewhere is a
-- many-to-many fact and needs a row of its own.
--
-- What it deliberately is NOT: a polymorphic (kind, ref_id) pair. That is the
-- shape of `quest_beat_attachments`, whose text `ref_id` cannot carry a foreign
-- key and so needs a trigger to validate what the database should have been
-- enforcing -- and which this epic is removing. Here each kind gets a real
-- column with a real FK and a real cascade, and a check constrains a row to
-- exactly one of them (an "exclusive arc"). Adding a kind later is a nullable
-- column plus one name in the check.

create table public.location_placements (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  location_id        uuid not null references public.locations(id) on delete cascade,

  trap_id            uuid references public.traps(id) on delete cascade,
  dungeon_feature_id uuid references public.dungeon_features(id) on delete cascade,
  roll_table_id      uuid references public.roll_tables(id) on delete cascade,
  loot_table_id      uuid references public.loot_tables(id) on delete cascade,

  -- Why this one is here: "pressure plate, triggers the portcullis at the far
  -- end". The catalogue entry says what the trap is; the placement says what it
  -- is doing in this room.
  note               text,
  sort_order         integer,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint location_placements_one_target check (
    num_nonnulls(trap_id, dungeon_feature_id, roll_table_id, loot_table_id) = 1
  )
);

comment on table public.location_placements is
  'Reusable prep material placed in a location. Many-to-many on purpose: one trap template may sit in several rooms. Exactly one of the four *_id columns is set, each a real FK - deliberately not a polymorphic (kind, ref_id) pair.';

-- No `campaign_id` column. `locations` already owns which campaign a place is
-- in, and a second copy of that fact is the duplication this epic exists to
-- remove; the insert policy joins for it instead. Nothing else needs it: the
-- other three policies are owner-scoped, exactly as puzzle_rooms' are.

create index location_placements_location_idx on public.location_placements (location_id);
create index location_placements_trap_idx    on public.location_placements (trap_id)            where trap_id is not null;
create index location_placements_feature_idx on public.location_placements (dungeon_feature_id) where dungeon_feature_id is not null;
create index location_placements_roll_idx    on public.location_placements (roll_table_id)      where roll_table_id is not null;
create index location_placements_loot_idx    on public.location_placements (loot_table_id)      where loot_table_id is not null;

-- The same entry twice in one room is a mistake every time; the same entry in
-- two rooms is the point. Partial uniques, because NULLs are distinct and a
-- single composite unique would permit duplicates.
create unique index location_placements_trap_uniq    on public.location_placements (location_id, trap_id)            where trap_id is not null;
create unique index location_placements_feature_uniq on public.location_placements (location_id, dungeon_feature_id) where dungeon_feature_id is not null;
create unique index location_placements_roll_uniq    on public.location_placements (location_id, roll_table_id)      where roll_table_id is not null;
create unique index location_placements_loot_uniq    on public.location_placements (location_id, loot_table_id)      where loot_table_id is not null;

create trigger location_placements_updated_at
  before update on public.location_placements
  for each row execute procedure update_updated_at();

alter table public.location_placements enable row level security;

-- Mirrors the live shape for campaign content since 20260828201935 (verified
-- against puzzle_rooms, not the stale template in CLAUDE.md): read and write
-- are owner-scoped, and creating one additionally requires being the DM of the
-- campaign the *location* belongs to. Global locations (campaign_id is null)
-- stay writable by their owner, as everywhere else.
create policy "location_placements_select" on public.location_placements
  for select using ((select auth.uid()) = user_id);

create policy "location_placements_insert" on public.location_placements
  for insert with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.locations l
      where l.id = location_id
        and (l.campaign_id is null or private.is_campaign_dm(l.campaign_id))
    )
    -- The placed entity must be the caller's too. FK checks bypass RLS, so
    -- without this a user could reference another account's trap: no
    -- disclosure (the join returns a null name), but the `on delete cascade`
    -- means the victim silently deletes the attacker's row.
    and (trap_id is null or exists (
      select 1 from public.traps t where t.id = trap_id and t.user_id = (select auth.uid())))
    and (dungeon_feature_id is null or exists (
      select 1 from public.dungeon_features f where f.id = dungeon_feature_id and f.user_id = (select auth.uid())))
    and (roll_table_id is null or exists (
      select 1 from public.roll_tables r where r.id = roll_table_id and r.user_id = (select auth.uid())))
    and (loot_table_id is null or exists (
      select 1 from public.loot_tables lt where lt.id = loot_table_id and lt.user_id = (select auth.uid())))
  );


-- `with check` is not optional here, and its absence is the exact hole
-- 20260828210805 exists to close. Without it Postgres reuses USING as the
-- check, which pins `user_id` but leaves the location pointer free — so a user
-- who cannot INSERT against someone else's site can still create a row on their
-- own and then UPDATE it to point there. The tables this migration says it
-- mirrors (`puzzle_rooms`, `traps`) both carry the check; they key it on their
-- own `campaign_id` column, which these tables deliberately do not have, so it
-- is restated here as the same join the INSERT policy uses.
create policy "location_placements_update" on public.location_placements
  for update
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.locations l
      where l.id = location_id
        and (l.campaign_id is null or private.is_campaign_dm(l.campaign_id))
    )
    -- The placed entity must be the caller's too. FK checks bypass RLS, so
    -- without this a user could reference another account's trap: no
    -- disclosure (the join returns a null name), but the `on delete cascade`
    -- means the victim silently deletes the attacker's row.
    and (trap_id is null or exists (
      select 1 from public.traps t where t.id = trap_id and t.user_id = (select auth.uid())))
    and (dungeon_feature_id is null or exists (
      select 1 from public.dungeon_features f where f.id = dungeon_feature_id and f.user_id = (select auth.uid())))
    and (roll_table_id is null or exists (
      select 1 from public.roll_tables r where r.id = roll_table_id and r.user_id = (select auth.uid())))
    and (loot_table_id is null or exists (
      select 1 from public.loot_tables lt where lt.id = loot_table_id and lt.user_id = (select auth.uid())))
  );

create policy "location_placements_delete" on public.location_placements
  for delete using ((select auth.uid()) = user_id);
