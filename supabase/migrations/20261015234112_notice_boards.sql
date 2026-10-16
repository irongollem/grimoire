-- Migration: notice_boards
-- A tavern notice board (#1064): the DM pins notes, wanted posters, sealed letters and pictures to a board in a campaign;
-- players read a revealed board, and while the DM presents it any of them can take a notice, which reveals its quest and
-- shares its handout with the whole party. Read the issue body for the decisions; the ones that shape this file:
--
--   * A board is Dungeon Craft prep, but bound to one campaign (campaign_id not null): it reveals that campaign's quests
--     and shares that campaign's handouts, so a board "in every campaign" would have nothing to offer.
--   * Players never read these tables. get_player_notice_boards projects what a player may see: a revealed board, the
--     face of every pin that is up or taken, and a pin's quest and handout only once it has been taken. A pin's face is
--     the player's; its links are not.
--   * take_notice_board_pin is the first quest reveal a player sets off. It works only while the board is presented (the
--     table is at the board together: the anti-grief rule), takes under a row lock so two taps make one take, and
--     treats "already taken" as an answer, not an error: losing a race costs nothing.
--   * The quest reveal is the same write a handout makes: extracted here into private.reveal_quest_to and called from
--     both apply_handout_reveals and the take, so the two cannot drift.
--   * Access is by campaign role (is_campaign_dm), never by user_id, so an ownership transfer or a co-DM leaving needs
--     no row moves here; user_id records who made a row.

-- ── one quest reveal, two callers ─────────────────────────────────────────────
-- What unlock_quest does (undiscovered -> active, a hidden entry beat becomes its rumour), plus the recipients, which
-- unlock_quest alone never adds. Invoker: a DM's share runs it under the DM's RLS, a definer RPC under its own, so the
-- campaign is part of the contract, not a caller's courtesy: a quest outside p_campaign_id (another campaign's, or a
-- member's own campaign-less quest, which the same-campaign trigger lets a pin name) is left alone.
create or replace function private.reveal_quest_to(p_campaign_id uuid, p_quest_id uuid, p_members uuid[])
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status quest_status_enum;
  v_entry uuid;
begin
  select q.status, q.entry_beat_id into v_status, v_entry
    from public.quests q
   where q.id = p_quest_id and q.campaign_id = p_campaign_id;
  if not found or p_members is null or cardinality(p_members) = 0 then
    return;
  end if;
  update public.quests
     set player_visible_to = array(select distinct x from unnest(player_visible_to || p_members) x),
         status = case when status = 'undiscovered' then 'active'::quest_status_enum else status end
   where id = p_quest_id and campaign_id = p_campaign_id;
  if v_status = 'undiscovered' then
    update public.quest_beats b
       set visibility = 'rumored'
     where b.id = v_entry and b.visibility = 'hidden';
  end if;
end;
$$;
revoke execute on function private.reveal_quest_to(uuid, uuid, uuid[]) from public, anon;
grant execute on function private.reveal_quest_to(uuid, uuid, uuid[]) to authenticated, service_role;

-- apply_handout_reveals, unchanged except that its quest branch now calls reveal_quest_to.
create or replace function private.apply_handout_reveals(
  p_campaign_id uuid,
  p_content text,
  p_members uuid[],
  p_dry_run boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_doc jsonb;
  v_attrs jsonb;
  v_reveal jsonb;
  v_type text;
  v_uuid uuid;
  v_off boolean;
  v_fields text[];
  v_new_fields text[];
  v_new_to uuid[];
  v_owner uuid;
  v_name text;
  v_flag boolean;
  v_revealed jsonb := '[]'::jsonb;
  v_withheld jsonb := '[]'::jsonb;
  r_npc record;
  r_loc record;
  r_quest record;
  r_disc record;
begin
  if p_members is null or cardinality(p_members) = 0 then
    return jsonb_build_object('revealed', v_revealed, 'withheld', v_withheld);
  end if;

  v_doc := coalesce(nullif(p_content, '')::jsonb, '{}'::jsonb);
  select c.user_id into v_owner from public.campaigns c where c.id = p_campaign_id;

  -- Document order, each embed node once (the result is collapsed to one line
  -- per entity after the loop): the share dialog lists what it reveals in the
  -- order the DM reads it on the page.
  for v_attrs in
    select t.attrs
      from (select e -> 'attrs' as attrs, min(ord) as first_at
              from jsonb_path_query(v_doc, 'strict $.**') with ordinality as q(e, ord)
             where jsonb_typeof(e) = 'object' and e ->> 'type' = 'entityEmbed'
             group by e -> 'attrs') t
     order by t.first_at
  loop
    v_type := v_attrs ->> 'entityType';
    v_reveal := case when jsonb_typeof(v_attrs -> 'reveal') = 'object' then v_attrs -> 'reveal' end;
    -- jsonb comparisons, never ::boolean casts: a malformed value in the
    -- document must reveal less, not abort a quest's Advance mid-transition.
    v_off := v_reveal -> 'off' = 'true'::jsonb;
    v_off := coalesce(v_off, false);
    -- A library monster's id is text; anything else is a uuid or nothing.
    -- (private.try_uuid exists but is closed to clients, and this runs as one.)
    begin
      v_uuid := (v_attrs ->> 'entityId')::uuid;
    exception when invalid_text_representation then
      v_uuid := null;
    end;

    -- ── npc: who (player_visible_to) and what (player_visible_fields) ──
    if v_type = 'npc' then
      select n.id, n.name, n.player_visible_to, n.player_visible_fields, n.disguise_name, n.is_revealed
        into r_npc
        from public.npcs n
       where n.id = v_uuid and n.campaign_id = p_campaign_id;
      if not found then
        v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', v_attrs ->> 'entityId', 'reason', 'outside_campaign');
        continue;
      end if;
      if v_reveal ? 'fields' and jsonb_typeof(v_reveal -> 'fields') = 'array' then
        select coalesce(array_agg(f), '{}') into v_fields
          from jsonb_array_elements_text(v_reveal -> 'fields') f
         where f in ('name', 'portrait', 'race', 'occupation', 'location');
      else
        v_fields := array['name']
          || case when v_attrs -> 'showArt' is distinct from 'false'::jsonb then array['portrait'] else '{}'::text[] end;
      end if;

      -- No fields is no reveal (effectiveEmbedReveal says the same): sharing
      -- an NPC with nothing of it visible would only add an invisible entry.
      if v_off or cardinality(v_fields) = 0 then
        if not (r_npc.player_visible_to @> p_members) then
          v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', r_npc.id, 'name', r_npc.name, 'reason', 'not_revealed');
        end if;
        continue;
      end if;

      v_new_fields := array(select distinct x from unnest(r_npc.player_visible_fields || v_fields) x order by 1);
      v_new_to := array(select distinct x from unnest(r_npc.player_visible_to || p_members) x);

      if not (r_npc.player_visible_fields @> v_fields and r_npc.player_visible_to @> p_members) then
        v_revealed := v_revealed || jsonb_build_object(
          'type', v_type, 'id', r_npc.id, 'name', r_npc.name, 'fields', to_jsonb(v_fields),
          -- A disguised NPC is revealed as its cover: the projection shows the
          -- disguise until the DM unmasks it, so say so before the DM confirms.
          'seen_as', case when r_npc.disguise_name is not null and not r_npc.is_revealed then r_npc.disguise_name end);
        if not p_dry_run then
          update public.npcs
             set player_visible_to = v_new_to, player_visible_fields = v_new_fields
           where id = r_npc.id;
        end if;
      end if;

    -- ── location: shared, and optionally its description ──
    elsif v_type = 'location' then
      select l.id, l.name, l.player_visible_to, l.is_description_shared
        into r_loc
        from public.locations l
       where l.id = v_uuid and l.campaign_id = p_campaign_id;
      if not found then
        v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', v_attrs ->> 'entityId', 'reason', 'outside_campaign');
        continue;
      end if;
      if v_off then
        if not (r_loc.player_visible_to @> p_members) then
          v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', r_loc.id, 'name', r_loc.name, 'reason', 'not_revealed');
        end if;
        continue;
      end if;
      v_flag := coalesce(v_reveal -> 'description' = 'true'::jsonb, false);
      if not (r_loc.player_visible_to @> p_members) or (v_flag and not r_loc.is_description_shared) then
        v_revealed := v_revealed || jsonb_build_object(
          'type', v_type, 'id', r_loc.id, 'name', r_loc.name, 'description', v_flag);
        if not p_dry_run then
          update public.locations
             set player_visible_to = array(select distinct x from unnest(player_visible_to || p_members) x),
                 is_description_shared = is_description_shared or v_flag
           where id = r_loc.id;
        end if;
      end if;

    -- ── quest: a handout can start one ──
    -- What unlock_quest does (undiscovered -> active, a hidden entry beat
    -- becomes its rumour), plus the recipients, which unlock_quest alone never
    -- adds: a quest nobody may see is not one the party has heard of.
    elsif v_type = 'quest' then
      select q.id, q.title, q.status, q.player_visible_to, q.entry_beat_id
        into r_quest
        from public.quests q
       where q.id = v_uuid and q.campaign_id = p_campaign_id;
      if not found then
        v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', v_attrs ->> 'entityId', 'reason', 'outside_campaign');
        continue;
      end if;
      if v_off then
        if not (r_quest.player_visible_to @> p_members) then
          v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', r_quest.id, 'name', r_quest.title, 'reason', 'not_revealed');
        end if;
        continue;
      end if;
      if not (r_quest.player_visible_to @> p_members) or r_quest.status = 'undiscovered' then
        v_revealed := v_revealed || jsonb_build_object(
          'type', v_type, 'id', r_quest.id, 'name', r_quest.title,
          'starts', r_quest.status = 'undiscovered');
        if not p_dry_run then
          perform private.reveal_quest_to(p_campaign_id, r_quest.id, p_members);
        end if;
      end if;

    -- ── monster: discovered, optionally with its stats ──
    elsif v_type = 'monster' then
      if v_uuid is not null then
        select m.name into v_name
          from public.monsters m
         where m.id = v_uuid
           and (m.campaign_id = p_campaign_id or (m.campaign_id is null and m.user_id = v_owner));
      else
        select lm.name into v_name from public.library_monsters lm where lm.id = v_attrs ->> 'entityId';
      end if;
      if v_name is null then
        v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', v_attrs ->> 'entityId', 'reason', 'outside_campaign');
        continue;
      end if;

      select d.id, d.visible_to, d.reveal_stats into r_disc
        from public.discovered_monsters d
       where d.campaign_id = p_campaign_id
         and (case when v_uuid is not null then d.monster_id = v_uuid
                   else d.library_monster_id = v_attrs ->> 'entityId' end);

      if v_off then
        if r_disc.id is null or not (r_disc.visible_to is null or r_disc.visible_to @> p_members) then
          v_withheld := v_withheld || jsonb_build_object('type', v_type, 'id', v_attrs ->> 'entityId', 'name', v_name, 'reason', 'not_revealed');
        end if;
        continue;
      end if;

      v_flag := coalesce(v_reveal -> 'stats' = 'true'::jsonb, false);
      -- visible_to null means the whole table already knows it.
      if r_disc.id is null
         or not (r_disc.visible_to is null or r_disc.visible_to @> p_members)
         or (v_flag and not r_disc.reveal_stats) then
        v_revealed := v_revealed || jsonb_build_object(
          'type', v_type, 'id', v_attrs ->> 'entityId', 'name', v_name, 'stats', v_flag);
        if not p_dry_run then
          if r_disc.id is null then
            insert into public.discovered_monsters (campaign_id, monster_id, library_monster_id, visible_to, reveal_stats)
            values (p_campaign_id, v_uuid,
                    case when v_uuid is null then v_attrs ->> 'entityId' end,
                    p_members, v_flag);
          else
            update public.discovered_monsters
               set visible_to = case when visible_to is null then null
                                     else array(select distinct x from unnest(visible_to || p_members) x) end,
                   reveal_stats = reveal_stats or v_flag
             where id = r_disc.id;
          end if;
        end if;
      end if;

    -- ── item: never revealed by paper; the party sees it once it has it ──
    elsif v_type = 'item' then
      select i.name into v_name from public.items i where i.id = v_uuid;
      v_withheld := v_withheld || jsonb_build_object(
        'type', v_type, 'id', v_attrs ->> 'entityId', 'name', v_name, 'reason', 'found_only');
    end if;
    -- spell: rules text, readable by players already; nothing to reveal.
  end loop;

  -- One line per entity. The loop above runs once per embed node (each has its
  -- own blockId in attrs), so an NPC linked twice would otherwise be listed
  -- twice: duplicate rows in the share dialog and a doubled pending count.
  -- An entity some other embed of it reveals is not also "withheld".
  v_revealed := (
    select coalesce(jsonb_agg(s.x order by s.o), '[]'::jsonb)
      from (select distinct on (t.x ->> 'type', t.x ->> 'id') t.x, t.o
              from jsonb_array_elements(v_revealed) with ordinality t(x, o)
             order by t.x ->> 'type', t.x ->> 'id', t.o) s);
  v_withheld := (
    select coalesce(jsonb_agg(s.x order by s.o), '[]'::jsonb)
      from (select distinct on (t.x ->> 'type', t.x ->> 'id') t.x, t.o
              from jsonb_array_elements(v_withheld) with ordinality t(x, o)
             where not exists (
               select 1 from jsonb_array_elements(v_revealed) r
                where r ->> 'type' = t.x ->> 'type' and r ->> 'id' = t.x ->> 'id')
             order by t.x ->> 'type', t.x ->> 'id', t.o) s);

  return jsonb_build_object('revealed', v_revealed, 'withheld', v_withheld);
end;
$$;
-- ── boards ────────────────────────────────────────────────────────────────────
create table public.notice_boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  -- cork (city, tavern) or planks (frontier, outpost); the frame follows the surface: cork hangs in oak, planks in pine.
  surface text not null default 'cork' check (surface in ('cork', 'planks')),
  is_revealed boolean not null default false,
  -- Set while the DM presents the board: it opens on every player's screen, and taking a notice works only then.
  presented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notice_boards_presented_is_revealed check (presented_at is null or is_revealed)
);
create index notice_boards_campaign_idx on public.notice_boards (campaign_id);
create index notice_boards_user_idx on public.notice_boards (user_id);

create trigger notice_boards_updated_at
  before update on public.notice_boards
  for each row execute procedure update_updated_at();

-- One board in front of the party at a time: presenting a board takes down whichever one was up.
create or replace function private.notice_board_present_one()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.presented_at is not null and (tg_op = 'INSERT' or old.presented_at is null) then
    update public.notice_boards
       set presented_at = null
     where campaign_id = new.campaign_id and id <> new.id and presented_at is not null;
  end if;
  return new;
end;
$$;
revoke execute on function private.notice_board_present_one() from public, anon, authenticated;
create trigger notice_boards_present_one
  after insert or update of presented_at on public.notice_boards
  for each row execute procedure private.notice_board_present_one();

alter table public.notice_boards enable row level security;
create policy "notice_boards_select" on public.notice_boards for select using (private.is_campaign_dm(campaign_id));
create policy "notice_boards_insert" on public.notice_boards for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "notice_boards_update" on public.notice_boards for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "notice_boards_delete" on public.notice_boards for delete using (private.is_campaign_dm(campaign_id));

-- ── pins ──────────────────────────────────────────────────────────────────────
create table public.notice_board_pins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  board_id uuid not null references public.notice_boards (id) on delete cascade,
  style text not null default 'note' check (style in ('note', 'poster', 'letter', 'image')),
  -- The face. headline: a poster's subject, a letter's addressee, a note's first line; body: the hand-written text;
  -- reward: a poster's bounty. A wanted poster's portrait is copied into image_url when the DM picks its NPC or monster,
  -- so the face is exactly what the DM chose to show and never follows a later edit (or a disguise) of that row.
  headline text,
  body text,
  reward text,
  image_url text,
  seal text check (seal in ('red', 'black')),
  size text not null default 'md' check (size in ('sm', 'md', 'lg')),
  -- Where on the board, as a fraction of its width and height, so one layout holds on every screen.
  x real not null default 0.5 check (x >= 0 and x <= 1),
  y real not null default 0.5 check (y >= 0 and y <= 1),
  -- Reading order for keyboards and screen readers, behind the visual scatter.
  sort_order integer not null default 0,
  -- draft: off the board, unseen; up: on the board; taken: torn down by a player, leaving its stub.
  status text not null default 'up' check (status in ('draft', 'up', 'taken')),
  quest_id uuid references public.quests (id) on delete set null,
  handout_id uuid references public.scriptorium_documents (id) on delete set null,
  taken_by uuid references public.party_members (id) on delete set null,
  taken_at timestamptz,
  -- The session number at the time of the take, copied (not a reference): the stub reads "session 12" for good.
  taken_session_number integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notice_board_pins_taken_has_time check ((status = 'taken') = (taken_at is not null))
);
create index notice_board_pins_board_idx on public.notice_board_pins (board_id, sort_order);
create index notice_board_pins_campaign_idx on public.notice_board_pins (campaign_id);
create index notice_board_pins_user_idx on public.notice_board_pins (user_id);
create index notice_board_pins_quest_idx on public.notice_board_pins (quest_id) where quest_id is not null;
create index notice_board_pins_handout_idx on public.notice_board_pins (handout_id) where handout_id is not null;
create index notice_board_pins_taken_by_idx on public.notice_board_pins (taken_by) where taken_by is not null;

create trigger notice_board_pins_updated_at
  before update on public.notice_board_pins
  for each row execute procedure update_updated_at();

-- A taken notice keeps what it offered: the projection and a late taker's answer name its quest and handout, so
-- re-pointing them would hand the party ids of something no take revealed. Pin it back up first to change them.
create or replace function private.notice_pin_keeps_its_offer()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if old.status = 'taken' and new.status = 'taken'
     and (new.quest_id is distinct from old.quest_id or new.handout_id is distinct from old.handout_id) then
    raise exception 'A taken notice keeps what it offered' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function private.notice_pin_keeps_its_offer() from public, anon, authenticated;
create trigger notice_board_pins_keep_offer
  before update of quest_id, handout_id on public.notice_board_pins
  for each row execute procedure private.notice_pin_keeps_its_offer();

create trigger zz_same_campaign_refs
  before insert or update of board_id, quest_id, handout_id, taken_by, campaign_id on public.notice_board_pins
  for each row execute procedure private.enforce_same_campaign_refs(
    'board_id', 'notice_boards', 'owned', 'quest_id', 'quests', 'owned',
    'handout_id', 'scriptorium_documents', 'owned', 'taken_by', 'party_members', 'owned');

alter table public.notice_board_pins enable row level security;
create policy "notice_board_pins_select" on public.notice_board_pins for select using (private.is_campaign_dm(campaign_id));
create policy "notice_board_pins_insert" on public.notice_board_pins for insert
  with check (private.is_campaign_dm(campaign_id) and user_id = (select auth.uid()));
create policy "notice_board_pins_update" on public.notice_board_pins for update
  using (private.is_campaign_dm(campaign_id)) with check (private.is_campaign_dm(campaign_id));
create policy "notice_board_pins_delete" on public.notice_board_pins for delete using (private.is_campaign_dm(campaign_id));

-- ── the doorbell ──────────────────────────────────────────────────────────────
create trigger notice_boards_signal_insert after insert on public.notice_boards
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger notice_boards_signal_update after update on public.notice_boards
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger notice_boards_signal_delete after delete on public.notice_boards
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger notice_board_pins_signal_insert after insert on public.notice_board_pins
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger notice_board_pins_signal_update after update on public.notice_board_pins
  referencing old table as left_rows new table as changed
  for each statement execute procedure public.signal_campaign_change();
create trigger notice_board_pins_signal_delete after delete on public.notice_board_pins
  referencing old table as changed
  for each statement execute procedure public.signal_campaign_change();

-- ── the demo copy ─────────────────────────────────────────────────────────────
-- A demo campaign may carry a board; the generic copier remaps every id, including a pin's quest, handout and taker.
insert into private.demo_campaign_tables (table_name, tier, copy, reason) values
  ('notice_boards', 1, true, null),
  ('notice_board_pins', 1, true, null);

-- ── hanging a board at a place ────────────────────────────────────────────────
alter table public.location_placements
  add column notice_board_id uuid references public.notice_boards (id) on delete cascade;
alter table public.location_placements drop constraint location_placements_one_target;
alter table public.location_placements add constraint location_placements_one_target check (
  num_nonnulls(trap_id, dungeon_feature_id, roll_table_id, loot_table_id, library_trap_id, library_dungeon_feature_id,
               notice_board_id) = 1);
create index location_placements_notice_board_idx on public.location_placements (notice_board_id) where notice_board_id is not null;
create unique index location_placements_notice_board_uniq on public.location_placements (location_id, notice_board_id)
  where notice_board_id is not null;

-- A board hangs only at a place in its own campaign. The policies are rewritten whole with one clause added for the
-- new arm, the same shape as the four uuid arms beside it.
drop policy "location_placements_insert" on public.location_placements;
create policy "location_placements_insert" on public.location_placements for insert to public
  with check (((select auth.uid()) = user_id) and (exists (select 1 from public.locations l where l.id = location_placements.location_id and ((l.campaign_id is null and l.user_id = (select auth.uid())) or (l.campaign_id is not null and private.is_campaign_dm(l.campaign_id)))))
    and ((trap_id is null) or exists (select 1 from public.traps x where x.id = location_placements.trap_id and private.can_use_in_campaign(x.user_id, x.campaign_id, private.location_campaign_id(location_placements.location_id)))) and ((dungeon_feature_id is null) or exists (select 1 from public.dungeon_features x where x.id = location_placements.dungeon_feature_id and private.can_use_in_campaign(x.user_id, x.campaign_id, private.location_campaign_id(location_placements.location_id)))) and ((roll_table_id is null) or exists (select 1 from public.roll_tables x where x.id = location_placements.roll_table_id and private.can_use_in_campaign(x.user_id, x.campaign_id, private.location_campaign_id(location_placements.location_id)))) and ((loot_table_id is null) or exists (select 1 from public.loot_tables x where x.id = location_placements.loot_table_id and private.can_use_in_campaign(x.user_id, x.campaign_id, private.location_campaign_id(location_placements.location_id))))
    and ((notice_board_id is null) or exists (select 1 from public.notice_boards x where x.id = location_placements.notice_board_id and x.campaign_id = private.location_campaign_id(location_placements.location_id))));
drop policy "location_placements_update" on public.location_placements;
create policy "location_placements_update" on public.location_placements for update to public
  using (((select auth.uid()) = user_id)
    or private.is_campaign_dm(private.location_campaign_id(location_placements.location_id)))
  with check ((((select auth.uid()) = user_id) or private.is_campaign_dm(private.location_campaign_id(location_placements.location_id))) and (exists (select 1 from public.locations l where l.id = location_placements.location_id and ((l.campaign_id is null and l.user_id = (select auth.uid())) or (l.campaign_id is not null and private.is_campaign_dm(l.campaign_id)))))
    and ((trap_id is null) or exists (select 1 from public.traps x where x.id = location_placements.trap_id and private.can_use_in_campaign(x.user_id, x.campaign_id, private.location_campaign_id(location_placements.location_id)))) and ((dungeon_feature_id is null) or exists (select 1 from public.dungeon_features x where x.id = location_placements.dungeon_feature_id and private.can_use_in_campaign(x.user_id, x.campaign_id, private.location_campaign_id(location_placements.location_id)))) and ((roll_table_id is null) or exists (select 1 from public.roll_tables x where x.id = location_placements.roll_table_id and private.can_use_in_campaign(x.user_id, x.campaign_id, private.location_campaign_id(location_placements.location_id)))) and ((loot_table_id is null) or exists (select 1 from public.loot_tables x where x.id = location_placements.loot_table_id and private.can_use_in_campaign(x.user_id, x.campaign_id, private.location_campaign_id(location_placements.location_id))))
    and ((notice_board_id is null) or exists (select 1 from public.notice_boards x where x.id = location_placements.notice_board_id and x.campaign_id = private.location_campaign_id(location_placements.location_id))));

-- ── what a player may see ─────────────────────────────────────────────────────
create or replace function public.get_player_notice_boards(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not coalesce(private.is_campaign_member(p_campaign_id), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', b.id,
             'name', b.name,
             'surface', b.surface,
             'presented_at', b.presented_at,
             'updated_at', b.updated_at,
             -- only the places the caller's character may see: an undiscovered place stays undiscovered
             'location_ids', coalesce((select jsonb_agg(lp.location_id)
                                         from public.location_placements lp
                                         join public.locations l on l.id = lp.location_id
                                        where lp.notice_board_id = b.id
                                          and private.my_party_member_id(p_campaign_id) = any (l.player_visible_to)), '[]'::jsonb),
             'pins', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'id', p.id,
                        'style', p.style,
                        'headline', p.headline,
                        'body', p.body,
                        'reward', p.reward,
                        'image_url', p.image_url,
                        'seal', p.seal,
                        'size', p.size,
                        'x', p.x,
                        'y', p.y,
                        'sort_order', p.sort_order,
                        'status', p.status,
                        'updated_at', p.updated_at,
                        -- that it offers something, never what, until it is taken
                        'offers', p.quest_id is not null or p.handout_id is not null,
                        'taken_by_name', pm.name,
                        'taken_at', p.taken_at,
                        'taken_session_number', p.taken_session_number,
                        'quest_id', case when p.status = 'taken' then p.quest_id end,
                        'handout_id', case when p.status = 'taken' then p.handout_id end
                      ) order by p.sort_order, p.created_at)
                 from public.notice_board_pins p
                 left join public.party_members pm on pm.id = p.taken_by
                where p.board_id = b.id and p.status <> 'draft'), '[]'::jsonb)
           ) order by b.name)
      from public.notice_boards b
     where b.campaign_id = p_campaign_id and b.is_revealed), '[]'::jsonb);
end;
$$;
revoke execute on function public.get_player_notice_boards(uuid) from public, anon;
grant execute on function public.get_player_notice_boards(uuid) to authenticated, service_role;

-- ── taking a notice ───────────────────────────────────────────────────────────
-- Returns { outcome: 'taken' | 'already_taken', taken_by_name, quest_id, handout_id }. The whole party gains what the
-- notice offers (the same "whole party" give_handout uses: every party member of the campaign), so the taker wins
-- nothing by being first, and the client opens the handout for the second tapper exactly as for the first.
create or replace function public.take_notice_board_pin(p_pin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pin public.notice_board_pins;
  v_board public.notice_boards;
  v_member uuid;
  v_taker text;
  v_party uuid[];
  v_doc public.scriptorium_documents;
  v_added uuid[];
  v_what text;
  v_campaign uuid;
begin
  -- Authorize first, on the campaign alone, and only then lock: a caller outside the campaign learns nothing (a pin
  -- that does not exist is refused the same way) and holds no lock.
  select p.campaign_id into v_campaign from public.notice_board_pins p where p.id = p_pin_id;
  v_member := private.my_party_member_id(v_campaign);
  if (select auth.uid()) is null or v_campaign is null or v_member is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  -- Locked before anything else is read from it: two players tapping at once queue here, and the second finds it taken.
  select * into v_pin from public.notice_board_pins where id = p_pin_id for update;
  if not found or v_pin.status = 'draft' then
    raise exception 'Notice not found' using errcode = 'P0002';
  end if;
  select * into v_board from public.notice_boards where id = v_pin.board_id;
  if not v_board.is_revealed or v_board.presented_at is null then
    raise exception 'The board is not in front of the party' using errcode = '42501';
  end if;
  if v_pin.quest_id is null and v_pin.handout_id is null then
    raise exception 'This notice offers nothing to take' using errcode = '22023';
  end if;
  if v_pin.status = 'taken' then
    return jsonb_build_object(
      'outcome', 'already_taken',
      'taken_by_name', (select pm.name from public.party_members pm where pm.id = v_pin.taken_by),
      'quest_id', v_pin.quest_id,
      'handout_id', v_pin.handout_id);
  end if;

  select pm.name into v_taker from public.party_members pm where pm.id = v_member;
  update public.notice_board_pins
     set status = 'taken',
         taken_by = v_member,
         taken_at = now(),
         taken_session_number = (select s.number from public.campaign_sessions s
                                  where s.campaign_id = v_pin.campaign_id
                                    and s.started_at is not null and s.ended_at is null)
   where id = v_pin.id;

  v_party := array(select pm.id from public.party_members pm where pm.campaign_id = v_pin.campaign_id);
  if v_pin.quest_id is not null then
    perform private.reveal_quest_to(v_pin.campaign_id, v_pin.quest_id, v_party);
  end if;
  if v_pin.handout_id is not null then
    -- give_handout's share: add who lacks it, and apply the handout's own entity reveals.
    select * into v_doc from public.scriptorium_documents d
     where d.id = v_pin.handout_id and d.campaign_id = v_pin.campaign_id;
    if found then
      v_added := array(select x from unnest(v_party) x except select y from unnest(v_doc.player_visible_to) y);
      perform private.apply_handout_reveals(v_pin.campaign_id, v_doc.content, v_doc.player_visible_to || v_added, false);
      if cardinality(v_added) > 0 then
        update public.scriptorium_documents set player_visible_to = v_doc.player_visible_to || v_added where id = v_doc.id;
      end if;
    end if;
  end if;

  -- Worded as the player's own toast words it (noticePhrase in src/lib/noticeBoard/faces.ts).
  v_what := case when nullif(btrim(v_pin.headline), '') is null then
                   case v_pin.style when 'poster' then 'a wanted poster' when 'letter' then 'a sealed letter'
                                    when 'image' then 'a picture' else 'a notice' end
                 when v_pin.style = 'poster' then 'the wanted poster for ' || btrim(v_pin.headline)
                 else '“' || btrim(v_pin.headline) || '”' end;
  insert into public.campaign_messages (campaign_id, user_id, sender_name, message, type)
  values (v_pin.campaign_id, v_board.user_id, 'Grimoire',
          '📌 ' || coalesce(v_taker, 'Someone') || ' took ' || v_what || ' from ' || v_board.name || '.', 'system');

  return jsonb_build_object('outcome', 'taken', 'taken_by_name', v_taker,
                            'quest_id', v_pin.quest_id, 'handout_id', v_pin.handout_id);
end;
$$;
revoke execute on function public.take_notice_board_pin(uuid) from public, anon;
grant execute on function public.take_notice_board_pin(uuid) to authenticated, service_role;
