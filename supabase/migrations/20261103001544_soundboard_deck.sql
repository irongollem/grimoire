-- The soundboard deck (#1136): a page becomes eight lanes of pads.
--
-- A pad sits at (lane, grid_row) on a page and plays either a music playlist or
-- scene (playlist_id) or its own sounds, the "takes" in soundboard_pad_takes,
-- which it plays in turn. What a press does (launch mode), whether it loops and
-- its fades are the pad's; null means "the default for the pad's kind", decided
-- in the client (src/lib/audio/deck/deckModel.ts) so a default can change
-- without rewriting rows.
--
-- A lane is "one at a time" (a new pad crossfades the old) or "together". The
-- eight lanes live on the page as jsonb, because they are the page's layout and
-- never queried on their own.
--
-- Also here: the `misc` category goes. Production held no misc sounds and the
-- shared library none; it was only the column default, and it played through
-- the ambience bus without saying so.

-- ── 1. Categories ─────────────────────────────────────────────────────────────
update public.sounds set category = 'effects' where category = 'misc';
alter table public.sounds alter column category set default 'effects';
alter table public.sounds
  add constraint sounds_category_check check (category in ('music', 'ambient', 'effects'));

update public.sound_library set category = 'effects' where category = 'misc';
alter table public.sound_library drop constraint if exists sound_library_category_check;
alter table public.sound_library
  add constraint sound_library_category_check check (category in ('music', 'ambient', 'effects'));

-- ── 2. Lanes on the page ──────────────────────────────────────────────────────
-- Total by construction: a missing key or a wrong type is false, never NULL, so
-- the CHECK cannot pass a malformed lane through.
create or replace function private.is_valid_deck_lanes(p_lanes jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_typeof(p_lanes) = 'array', false)
     and jsonb_array_length(p_lanes) = 8
     and not exists (
       select 1
         from jsonb_array_elements(p_lanes) as lane
        where coalesce(jsonb_typeof(lane), '') <> 'object'
           or coalesce(jsonb_typeof(lane -> 'name'), '') <> 'string'
           or coalesce(char_length(lane ->> 'name'), 0) not between 1 and 40
           or coalesce(lane ->> 'rule', '') not in ('one', 'together')
     );
$$;
grant execute on function private.is_valid_deck_lanes(jsonb) to authenticated, service_role;

alter table public.soundboard_pages
  add column lanes jsonb not null default '[
    {"name": "Music",    "rule": "one"},
    {"name": "Place",    "rule": "one"},
    {"name": "Ambience", "rule": "together"},
    {"name": "Effects",  "rule": "together"},
    {"name": "Effects",  "rule": "together"},
    {"name": "Effects",  "rule": "together"},
    {"name": "Effects",  "rule": "together"},
    {"name": "Stingers", "rule": "together"}
  ]'::jsonb;
alter table public.soundboard_pages
  add constraint soundboard_pages_lanes_check check (private.is_valid_deck_lanes(lanes));

-- ── 3. Pads ───────────────────────────────────────────────────────────────────
create table public.soundboard_pads (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  page_id      uuid not null references public.soundboard_pages(id) on delete cascade,
  lane         smallint not null check (lane between 0 and 7),
  grid_row     smallint not null check (grid_row between 0 and 255),
  -- A scene (ambient) or music playlist. Null: the pad plays its takes.
  playlist_id  uuid references public.soundboard_playlists(id) on delete cascade,
  name         text check (name is null or char_length(name) between 1 and 80),
  launch_mode  text check (launch_mode is null or launch_mode in ('trigger', 'toggle', 'gate', 'repeat')),
  loop         boolean,
  volume       real not null default 0.8 check (volume between 0 and 1),
  fade_in_ms   integer check (fade_in_ms is null or fade_in_ms between 0 and 20000),
  fade_out_ms  integer check (fade_out_ms is null or fade_out_ms between 0 and 20000),
  -- Nudge pitch and loudness a little on every press (round robin).
  vary         boolean not null default true,
  -- Louder the harder a controller pad is hit.
  velocity     boolean not null default false,
  repeat_ms    integer not null default 500 check (repeat_ms between 100 and 5000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Deferrable so move_soundboard_pad can swap two pads in one statement pair.
  constraint soundboard_pads_slot_key unique (page_id, lane, grid_row) deferrable initially immediate
);

create index soundboard_pads_campaign_id_idx on public.soundboard_pads (campaign_id);
create index soundboard_pads_user_id_idx on public.soundboard_pads (user_id);
create index soundboard_pads_playlist_id_idx on public.soundboard_pads (playlist_id) where playlist_id is not null;

create trigger soundboard_pads_updated_at
  before update on public.soundboard_pads
  for each row execute procedure update_updated_at();

create trigger soundboard_pads_guard_content_author
  before update on public.soundboard_pads
  for each row when (new.user_id is distinct from old.user_id or new.campaign_id is distinct from old.campaign_id)
  execute procedure private.guard_content_author();

create trigger zz_same_campaign_refs
  before insert or update of page_id, playlist_id, campaign_id on public.soundboard_pads
  for each row execute procedure private.enforce_same_campaign_refs(
    'page_id', 'soundboard_pages', 'owned',
    'playlist_id', 'soundboard_playlists', 'owned');

alter table public.soundboard_pads enable row level security;

create policy "soundboard_pads_select" on public.soundboard_pads for select to public
  using (((select auth.uid()) = user_id) or private.is_campaign_dm(campaign_id));
create policy "soundboard_pads_insert" on public.soundboard_pads for insert to public
  with check ((select auth.uid()) = user_id and private.is_campaign_dm(campaign_id));
create policy "soundboard_pads_update" on public.soundboard_pads for update to public
  using (((select auth.uid()) = user_id) or private.is_campaign_dm(campaign_id))
  with check (private.is_campaign_dm(campaign_id));
create policy "soundboard_pads_delete" on public.soundboard_pads for delete to public
  using (((select auth.uid()) = user_id) or private.is_campaign_owner(campaign_id));

grant select, insert, update, delete on public.soundboard_pads to authenticated, service_role;

-- Drag a pad to a slot; a pad already there swaps into the one it left.
-- Invoker: RLS decides who may move what. A pad the caller cannot see is "not
-- found", and an occupant they cannot update stays put, so the slot key then
-- refuses the move instead of stacking two pads.
create or replace function public.move_soundboard_pad(p_pad_id uuid, p_page_id uuid, p_lane integer, p_row integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_from public.soundboard_pads%rowtype;
  v_other uuid;
begin
  select * into v_from from public.soundboard_pads where id = p_pad_id;
  if not found then
    raise exception 'Pad not found' using errcode = 'P0002';
  end if;
  set constraints public.soundboard_pads_slot_key deferred;
  select id into v_other
    from public.soundboard_pads
   where page_id = p_page_id and lane = p_lane and grid_row = p_row and id <> p_pad_id;
  if v_other is not null then
    update public.soundboard_pads
       set page_id = v_from.page_id, lane = v_from.lane, grid_row = v_from.grid_row
     where id = v_other;
  end if;
  update public.soundboard_pads
     set page_id = p_page_id, lane = p_lane, grid_row = p_row
   where id = p_pad_id;
  set constraints public.soundboard_pads_slot_key immediate;
end;
$$;
revoke execute on function public.move_soundboard_pad(uuid, uuid, integer, integer) from public, anon;
grant execute on function public.move_soundboard_pad(uuid, uuid, integer, integer) to authenticated, service_role;

-- ── 4. Takes: the sounds a sound pad plays, in order ─────────────────────────
create table public.soundboard_pad_takes (
  id          uuid primary key default gen_random_uuid(),
  pad_id      uuid not null references public.soundboard_pads(id) on delete cascade,
  sound_id    uuid not null references public.sounds(id) on delete cascade,
  position    smallint not null default 0 check (position >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (pad_id, sound_id)
);

create index soundboard_pad_takes_sound_id_idx on public.soundboard_pad_takes (sound_id);

create trigger soundboard_pad_takes_updated_at
  before update on public.soundboard_pad_takes
  for each row execute procedure update_updated_at();

-- A take has no campaign_id of its own, so the shared same-campaign trigger
-- cannot see it: a pad may only play its own campaign's sounds.
create or replace function private.guard_pad_take_campaign()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
      from public.soundboard_pads p
      join public.sounds s on s.id = new.sound_id
     where p.id = new.pad_id
       and s.campaign_id = p.campaign_id
  ) then
    raise exception 'A pad can only play sounds from its own campaign'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function private.guard_pad_take_campaign() from public, anon, authenticated;

create trigger soundboard_pad_takes_guard_campaign
  before insert or update of pad_id, sound_id on public.soundboard_pad_takes
  for each row execute procedure private.guard_pad_take_campaign();

-- A sound pad whose last take is gone (its sound was deleted) has nothing left
-- to play; it goes too, so the slot reads as empty instead of as a dead pad.
-- Definer: a sound's deletion cascades here whoever deleted it, and the pad may
-- belong to the other DM.
create or replace function private.drop_empty_sound_pad()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.soundboard_pads p
   where p.id = old.pad_id
     and p.playlist_id is null
     and not exists (select 1 from public.soundboard_pad_takes t where t.pad_id = p.id);
  return null;
end;
$$;
revoke execute on function private.drop_empty_sound_pad() from public, anon, authenticated;

create trigger soundboard_pad_takes_drop_empty_pad
  after delete on public.soundboard_pad_takes
  for each row execute procedure private.drop_empty_sound_pad();

alter table public.soundboard_pad_takes enable row level security;

create policy "soundboard_pad_takes_select" on public.soundboard_pad_takes for select to public
  using (exists (select 1 from public.soundboard_pads p where p.id = pad_id));
create policy "soundboard_pad_takes_insert" on public.soundboard_pad_takes for insert to public
  with check (exists (
    select 1 from public.soundboard_pads p
     where p.id = pad_id
       and (((select auth.uid()) = p.user_id) or private.is_campaign_dm(p.campaign_id))));
create policy "soundboard_pad_takes_update" on public.soundboard_pad_takes for update to public
  using (exists (
    select 1 from public.soundboard_pads p
     where p.id = pad_id
       and (((select auth.uid()) = p.user_id) or private.is_campaign_dm(p.campaign_id))))
  with check (exists (
    select 1 from public.soundboard_pads p
     where p.id = pad_id
       and (((select auth.uid()) = p.user_id) or private.is_campaign_dm(p.campaign_id))));
create policy "soundboard_pad_takes_delete" on public.soundboard_pad_takes for delete to public
  using (exists (
    select 1 from public.soundboard_pads p
     where p.id = pad_id
       and (((select auth.uid()) = p.user_id) or private.is_campaign_dm(p.campaign_id))));

grant select, insert, update, delete on public.soundboard_pad_takes to authenticated, service_role;

-- ── 5. Live: both ring the campaign doorbell ─────────────────────────────────
create trigger soundboard_pads_signal_insert after insert on public.soundboard_pads
  referencing new table as changed for each statement execute procedure public.signal_campaign_change();
create trigger soundboard_pads_signal_update after update on public.soundboard_pads
  referencing old table as left_rows new table as changed for each statement execute procedure public.signal_campaign_change();
create trigger soundboard_pads_signal_delete after delete on public.soundboard_pads
  referencing old table as changed for each statement execute procedure public.signal_campaign_change();

create trigger soundboard_pad_takes_signal_insert after insert on public.soundboard_pad_takes
  referencing new table as changed for each statement execute procedure public.signal_parent_change('soundboard_pads', 'pad_id');
create trigger soundboard_pad_takes_signal_update after update on public.soundboard_pad_takes
  referencing old table as left_rows new table as changed for each statement execute procedure public.signal_parent_change('soundboard_pads', 'pad_id');
create trigger soundboard_pad_takes_signal_delete after delete on public.soundboard_pad_takes
  referencing old table as changed for each statement execute procedure public.signal_parent_change('soundboard_pads', 'pad_id');

-- ── 6. The demo campaign copies the deck with the rest of the soundboard ─────
insert into private.demo_campaign_tables (table_name, tier, parent_column, parent_table, copy, defer_columns, reason) values
  ('soundboard_pads', 1, null, null, true, '{}', null),
  ('soundboard_pad_takes', 2, 'pad_id', 'soundboard_pads', true, '{}', null);

-- ── 7. A handed-over campaign hands over its deck ────────────────────────────
-- move_campaign_content restated whole (its definition from 20261026213604) with
-- soundboard_pads added beside the other soundboard tables. Without it the old
-- owner keeps the pads, and deleting their account would take the deck with it.
CREATE OR REPLACE FUNCTION private.move_campaign_content(p_campaign_id uuid, p_from uuid, p_to uuid, p_scoped_homebrew boolean, p_player_rows boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_prev_move  text := current_setting('grimoire.content_move', true);
  v_prev_quota text := current_setting('grimoire.bypass_quota', true);
begin
  -- The author guard (private.guard_content_author) lets this through, and
  -- re-stamped rows are not new rows to count against anyone's quota.
  perform set_config('grimoire.content_move', 'on', true);
  perform set_config('grimoire.bypass_quota', 'on', true);

  update public.calendar_events       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.class_features        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.crafting_recipes      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.custom_classes        set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.custom_subclasses     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.deities               set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.encounter_state       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.encounters            set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.factions              set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.items                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.kin_links             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.world_links           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notice_board_pins     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notice_boards         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.locations             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.loot_tables           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.notes                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_inventory         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npc_sets              set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.npcs                  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.pantheons             set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.puzzle_rooms          set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.quests                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.roll_tables           set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.rules                 set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.scriptorium_documents set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.session_proposals     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_broadcast  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_pages      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_playlists  set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.soundboard_pads       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.sounds                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.species               set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.spells                set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  update public.campaign_sessions     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;

  -- What a member writes as a player (their own character, its inventory and
  -- companions, journal entries on items, class option texts). A seat that
  -- rotates has written these before it took the chair, so handing the chair
  -- back leaves them where they are; a transfer and a deleted account move
  -- them, the first because the outgoing owner wrote them as DM, the second
  -- because otherwise they cascade away.
  if p_player_rows then
    update public.class_option_texts set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.companions         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.party_inventory    set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.party_members      set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.item_entries       set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  end if;

  -- Rows that carry an author but no campaign_id, scoped by their parent.
  update public.faction_npcs f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.faction_party_members f set user_id = p_to
   where f.user_id = p_from
     and exists (select 1 from public.factions x where x.id = f.faction_id and x.campaign_id = p_campaign_id);
  update public.store_items si set user_id = p_to
   where si.user_id = p_from
     and exists (select 1 from public.locations l where l.id = si.location_id and l.campaign_id = p_campaign_id);
  update public.location_doors d set user_id = p_to
   where d.user_id = p_from
     and exists (select 1 from public.locations l where l.id = d.from_location_id and l.campaign_id = p_campaign_id);
  update public.location_map_regions r set user_id = p_to
   where r.user_id = p_from
     and exists (select 1 from public.locations l where l.id = r.site_location_id and l.campaign_id = p_campaign_id);
  update public.location_placements lp set user_id = p_to
   where lp.user_id = p_from
     and exists (select 1 from public.locations l where l.id = lp.location_id and l.campaign_id = p_campaign_id);
  update public.location_state_events e set user_id = p_to
   where e.user_id = p_from
     and exists (select 1 from public.locations l where l.id = e.location_id and l.campaign_id = p_campaign_id);

  if p_scoped_homebrew then
    update public.monsters         set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.traps            set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.dungeon_maps     set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
    update public.dungeon_features set user_id = p_to where campaign_id = p_campaign_id and user_id = p_from;
  end if;

  perform set_config('grimoire.content_move', coalesce(v_prev_move, ''), true);
  perform set_config('grimoire.bypass_quota', coalesce(v_prev_quota, ''), true);
end;
$function$;

-- ── 8. Lay every existing board out as pads ──────────────────────────────────
-- Per page, by kind: music sounds then music playlists down the Music lane,
-- scenes down Place, ambient sounds down Ambience, effects across the four
-- Effects lanes a row at a time. Stingers starts empty. A sound or playlist
-- that never had a page goes on its campaign's first page; a campaign with
-- such rows and no page at all gets a "Main" page, which is what the old
-- board created on first load.
select set_config('grimoire.bypass_quota', 'on', true);

insert into public.soundboard_pages (campaign_id, user_id, name, sort_order)
select c.id, c.user_id, 'Main', 0
  from public.campaigns c
 where not exists (select 1 from public.soundboard_pages pg where pg.campaign_id = c.id)
   and (exists (select 1 from public.sounds s where s.campaign_id = c.id)
        or exists (select 1 from public.soundboard_playlists pl where pl.campaign_id = c.id));

create temporary table deck_first_page on commit drop as
select distinct on (campaign_id) campaign_id, id as page_id
  from public.soundboard_pages
 order by campaign_id, sort_order, created_at, id;

create temporary table deck_items on commit drop as
with items as (
  select s.campaign_id, s.user_id, coalesce(s.page_id, fp.page_id) as page_id,
         s.id as sound_id, null::uuid as playlist_id,
         case s.category when 'music' then 'music' when 'ambient' then 'ambient' else 'effects' end as lane_kind,
         0 as kind_order, s.sort_order, s.name
    from public.sounds s
    join deck_first_page fp on fp.campaign_id = s.campaign_id
  union all
  select pl.campaign_id, pl.user_id, coalesce(pl.page_id, fp.page_id),
         null::uuid, pl.id,
         case pl.playlist_type when 'music' then 'music' else 'scene' end,
         1, pl.sort_order, pl.name
    from public.soundboard_playlists pl
    join deck_first_page fp on fp.campaign_id = pl.campaign_id
),
ranked as (
  select i.*,
         (row_number() over (partition by i.page_id, i.lane_kind
                             order by i.kind_order, i.sort_order, i.name, coalesce(i.sound_id, i.playlist_id)) - 1)::integer as n
    from items i
)
select gen_random_uuid() as pad_id, r.campaign_id, r.user_id, r.page_id, r.sound_id, r.playlist_id,
       (case r.lane_kind
          when 'music' then 0
          when 'scene' then 1
          when 'ambient' then 2
          else 3 + (r.n % 4)
        end)::smallint as lane,
       (case r.lane_kind when 'effects' then r.n / 4 else r.n end)::smallint as grid_row
  from ranked r
 where (case r.lane_kind when 'effects' then r.n / 4 else r.n end) <= 255;

insert into public.soundboard_pads (id, campaign_id, user_id, page_id, lane, grid_row, playlist_id)
select pad_id, campaign_id, user_id, page_id, lane, grid_row, playlist_id
  from deck_items;

insert into public.soundboard_pad_takes (pad_id, sound_id, position)
select pad_id, sound_id, 0
  from deck_items
 where sound_id is not null;
