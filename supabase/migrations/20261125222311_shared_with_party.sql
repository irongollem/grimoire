-- #1259: sharing with "the party" reaches a character who joins later.
--
-- Every reveal stores the party member ids it was shared with in `player_visible_to`, and nothing added a member who
-- joined afterwards: a replacement character saw no told lore, no known places, no shared notes, even where the DM had
-- shown them to the whole party. Forty-odd readers check `member = any (player_visible_to)`, so the fix keeps that one
-- reveal model and makes the array mean the whole party when the DM meant the whole party:
--
--   shared_with_party   true when the row is shared with every member of the party as it sits at the table (no
--                       memorial in effect, the same rule as `activeMembers` on the client). It is never written by a
--                       client: `private.stamp_shared_with_party` derives it on every write that could change it, from
--                       the same thing the reveal control shows, so "Whole party" on screen and the flag cannot differ.
--   the party changing  `private.reconcile_party_shares` adds a newcomer (or a character back from the wall) to every row
--                       shared with the whole party, and marks a row that now covers the whole party (its last
--                       unlisted member fell or left) as shared with it.
--
-- So readers are unchanged and an explicit audience stays explicit: a secret shown to everyone but one character is
-- not widened to the next one who joins, which a join-time guess ("add them wherever everyone else is listed") would do.
--
-- These writes are the server's, not an edit: they keep each row's `updated_at` (the transaction-local
-- `grimoire.party_join` setting tells the stamp to put it back), and `guard_player_passage` lets them through though they
-- run inside a player's own transaction when that player joins.

-- ─── The flag ────────────────────────────────────────────────────────────────────────────────────────────────────────

alter table public.canon_entries          add column shared_with_party boolean not null default false;
alter table public.canon_lore_passages    add column shared_with_party boolean not null default false;
alter table public.crafting_recipes       add column shared_with_party boolean not null default false;
alter table public.deities                add column shared_with_party boolean not null default false;
alter table public.faction_npcs           add column shared_with_party boolean not null default false;
alter table public.faction_party_members  add column shared_with_party boolean not null default false;
alter table public.factions               add column shared_with_party boolean not null default false;
alter table public.locations              add column shared_with_party boolean not null default false;
alter table public.notes                  add column shared_with_party boolean not null default false;
alter table public.npc_memories           add column shared_with_party boolean not null default false;
alter table public.npcs                   add column shared_with_party boolean not null default false;
alter table public.pantheons              add column shared_with_party boolean not null default false;
alter table public.puzzle_rooms           add column shared_with_party boolean not null default false;
alter table public.scriptorium_documents  add column shared_with_party boolean not null default false;
alter table public.world_links            add column shared_with_party boolean not null default false;

-- ─── The party as it sits at the table ──────────────────────────────────────────────────────────────────────────────

-- A fallen or retired character stays a party member (their sheet, mentions and journal still resolve) but is not
-- someone to share with: requiring them would make every share after a death "partial" for good.
create or replace function private.active_party(p_campaign_id uuid)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  select coalesce(array_agg(pm.id order by pm.id), '{}'::uuid[])
    from public.party_members pm
   where pm.campaign_id = p_campaign_id
     and not exists (
       select 1 from public.character_memorials cm
        where cm.party_member_id = pm.id and cm.restored_at is null
     );
$$;

revoke execute on function private.active_party(uuid) from public, anon, authenticated;

-- ─── Deriving the flag on every write ───────────────────────────────────────────────────────────────────────────────

create or replace function private.stamp_shared_with_party()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign uuid;
  v_party uuid[];
begin
  -- A faction's membership rows have no campaign of their own; they share the faction's.
  if tg_table_name in ('faction_npcs', 'faction_party_members') then
    select f.campaign_id into v_campaign from public.factions f where f.id = new.faction_id;
  else
    v_campaign := (to_jsonb(new) ->> 'campaign_id')::uuid;
  end if;

  v_party := case when v_campaign is null then '{}'::uuid[] else private.active_party(v_campaign) end;
  new.shared_with_party := cardinality(v_party) > 0 and v_party <@ new.player_visible_to;

  -- The party changing is not an edit to the row (see the header); `faction_npcs` has no `updated_at`.
  if tg_op = 'UPDATE'
     and current_setting('grimoire.party_join', true) = 'on'
     and to_jsonb(old) ? 'updated_at' then
    new := jsonb_populate_record(new, jsonb_build_object('updated_at', to_jsonb(old) -> 'updated_at'));
  end if;
  return new;
end;
$$;

revoke execute on function private.stamp_shared_with_party() from public, anon, authenticated;

-- Named `zzz_` so it runs after every other BEFORE trigger: after the normalisers that rewrite the array
-- (`normalize_npc_memory`, `scriptorium_documents_unshare_on_rescope`) and after `*_updated_at`, which it may undo.
do $$
declare
  t text;
  v_scope text;
begin
  foreach t in array array[
    'canon_entries', 'canon_lore_passages', 'crafting_recipes', 'deities', 'faction_npcs', 'faction_party_members',
    'factions', 'locations', 'notes', 'npc_memories', 'npcs', 'pantheons', 'puzzle_rooms', 'scriptorium_documents',
    'world_links'
  ] loop
    v_scope := case when t in ('faction_npcs', 'faction_party_members') then 'faction_id' else 'campaign_id' end;
    execute format(
      'create trigger zzz_shared_with_party_insert before insert on public.%I
         for each row execute function private.stamp_shared_with_party()', t);
    execute format(
      'create trigger zzz_shared_with_party_update before update on public.%I
         for each row
         when (new.player_visible_to is distinct from old.player_visible_to
               or new.shared_with_party is distinct from old.shared_with_party
               or new.%2$I is distinct from old.%2$I)
         execute function private.stamp_shared_with_party()', t, v_scope);
  end loop;
end;
$$;

-- ─── The party changing ─────────────────────────────────────────────────────────────────────────────────────────────

create or replace function private.reconcile_party_shares(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_party uuid[];
  v_prev text := current_setting('grimoire.party_join', true);
  t text;
  v_in_campaign text;
begin
  -- A campaign being deleted takes its rows with it; touching them mid-cascade is not ours to do.
  if p_campaign_id is null or not exists (select 1 from public.campaigns c where c.id = p_campaign_id) then
    return;
  end if;
  v_party := private.active_party(p_campaign_id);
  if cardinality(v_party) = 0 then
    return;
  end if;

  perform set_config('grimoire.party_join', 'on', true);
  foreach t in array array[
    'canon_entries', 'canon_lore_passages', 'crafting_recipes', 'deities', 'faction_npcs', 'faction_party_members',
    'factions', 'locations', 'notes', 'npc_memories', 'npcs', 'pantheons', 'puzzle_rooms', 'scriptorium_documents',
    'world_links'
  ] loop
    v_in_campaign := case
      when t in ('faction_npcs', 'faction_party_members') then
        'exists (select 1 from public.factions f where f.id = x.faction_id and f.campaign_id = $1)'
      else 'x.campaign_id = $1'
    end;
    -- Shared with the whole party: the whole party now includes the newcomer.
    execute format(
      'update public.%I x
          set player_visible_to = array(select distinct m from unnest(x.player_visible_to || $2) m order by m)
        where %s and x.shared_with_party and not ($2 <@ x.player_visible_to)', t, v_in_campaign)
      using p_campaign_id, v_party;
    -- Shared with everyone still at the table: that is the whole party now. The stamp sets the flag from the array.
    execute format(
      'update public.%I x
          set shared_with_party = true
        where %s and not x.shared_with_party and $2 <@ x.player_visible_to', t, v_in_campaign)
      using p_campaign_id, v_party;
  end loop;
  perform set_config('grimoire.party_join', coalesce(v_prev, ''), true);
end;
$$;

revoke execute on function private.reconcile_party_shares(uuid) from public, anon, authenticated;

create or replace function private.party_shares_follow_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign uuid;
begin
  if tg_table_name = 'party_members' and tg_op = 'UPDATE' then
    -- Attached to one campaign, detached from another (`attach_party_member_to_campaign` and its siblings).
    perform private.reconcile_party_shares(old.campaign_id);
    perform private.reconcile_party_shares(new.campaign_id);
    return null;
  end if;
  -- Statement-level for inserts and memorials, so a campaign copy inserting a party reconciles each campaign once.
  for v_campaign in select distinct campaign_id from changed where campaign_id is not null loop
    perform private.reconcile_party_shares(v_campaign);
  end loop;
  return null;
end;
$$;

revoke execute on function private.party_shares_follow_members() from public, anon, authenticated;

-- A deleted character leaves no trigger here: their id lingers harmlessly in the arrays (as it always has), and a
-- delete can be part of an account's erasure cascade, mid-way through which the rows it would touch may be going too.
create trigger party_members_shares_insert
  after insert on public.party_members
  referencing new table as changed
  for each statement execute function private.party_shares_follow_members();

create trigger party_members_shares_move
  after update of campaign_id on public.party_members
  for each row when (new.campaign_id is distinct from old.campaign_id)
  execute function private.party_shares_follow_members();

-- A character falling (a memorial) or coming back (`restored_at`, or the memorial removed) changes who is at the table.
create trigger character_memorials_shares_insert
  after insert on public.character_memorials
  referencing new table as changed
  for each statement execute function private.party_shares_follow_members();

create trigger character_memorials_shares_update
  after update on public.character_memorials
  referencing new table as changed
  for each statement execute function private.party_shares_follow_members();

create trigger character_memorials_shares_delete
  after delete on public.character_memorials
  referencing old table as changed
  for each statement execute function private.party_shares_follow_members();

-- ─── Player projections return the whole row, by position ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_player_visible_factions(p_campaign_id uuid, p_preview_member_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF factions
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
  select
    f.id,
    f.user_id,
    f.name,
    f.faction_type,
    private.withhold_secret_blocks(f.description),
    f.emblem_url,
    f.alignment,
    f.tags,
    f.created_at,
    f.updated_at,
    f.player_visible_to,
    f.campaign_id,
    f.ai_provenance,
    f.setting_source,
    null::text,                          -- demo_source (#912): a quota marker, nothing for players
    f.party_standing,
    f.descent,                           -- #1083: how the house reckons its own
    ''::text,                            -- succession_note (#1083): the DM's
    case                                 -- seat_location_id: only a seat the player can already see
      -- A DM previewing one member sees that member's seats only (not their own linked character's);
      -- previewing nobody, a seat shared with any member. Anyone else: a place shared with their own character.
      when exists (
        select 1 from locations l
         where l.id = f.seat_location_id
           and case
             when private.is_campaign_dm(l.campaign_id) and p_preview_member_id is not null then
               p_preview_member_id = any (l.player_visible_to)
             when private.is_campaign_dm(l.campaign_id) then
               array_length(l.player_visible_to, 1) is not null
             else exists (
               select 1 from campaign_members cm
                where cm.user_id = (select auth.uid())
                  and cm.campaign_id = l.campaign_id
                  and cm.party_member_id = any (l.player_visible_to)
             )
           end
      ) then f.seat_location_id
      else null::uuid
    end,
    f.shared_with_party                                   -- shared_with_party (#1259): whether a later joiner sees it too
  from factions f
  where f.campaign_id = p_campaign_id
    and (
      private.faction_is_visible_to_caller(f.id)
      or (
        private.is_campaign_dm(f.campaign_id)
        and case
          when p_preview_member_id is not null then
            p_preview_member_id = any (f.player_visible_to)
            or exists (
              select 1 from faction_party_members fpm
               where fpm.faction_id = f.id
                 and fpm.party_member_id = p_preview_member_id
            )
          else
            array_length(f.player_visible_to, 1) is not null
            or exists (select 1 from faction_party_members fpm where fpm.faction_id = f.id)
        end
      )
    )
$function$;

CREATE OR REPLACE FUNCTION public.get_player_visible_locations(p_campaign_id uuid DEFAULT NULL::uuid, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF locations
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    l.id,
    l.user_id,
    l.campaign_id,
    l.parent_id,
    l.name,
    l.location_type,
    case when l.is_description_shared then private.withhold_secret_blocks(l.description) else null::text end,
    null::text,                                                               -- notes (DM-only)
    l.tags,
    l.image_url,
    l.created_at,
    l.updated_at,
    case when l.is_map_shared then l.map_url else null::text end,
    coalesce((
      select jsonb_agg(pin)
      from jsonb_array_elements(coalesce(l.map_pins, '[]'::jsonb)) pin
      where coalesce((pin->>'visible_to_players')::boolean, false)
    ), '[]'::jsonb),
    l.is_map_shared,
    l.player_summary,
    l.is_description_shared,
    l.is_npcs_shared,
    l.player_visible_to,
    l.is_inventory_shared,
    l.npc_owner_id,
    l.related_location_ids,
    l.source_map_id,
    l.grid_calibration,
    l.is_battle_map,
    l.era_start,
    l.era_end,
    null::text,                                                               -- audio_theme (DM-only)
    l.ai_provenance,
    l.setting_source,
    l.sort_order,
    null::integer,                                                            -- map_published_rev (DM tooling)
    case when l.is_map_shared then l.map_layer_url else null::text end,
    case when l.is_map_shared then l.map_layer_calibration else null::jsonb end,
    case when l.is_map_shared then l.plan_size else null::jsonb end,
    null::text,                                                               -- demo_source (#912): a quota marker, nothing for players
    l.is_level,                                                               -- which nested sites are floors: structure, like parent_id
    case when l.is_map_shared then l.map_scale else null::jsonb end,          -- map_scale (#932): travels with the map
    case when l.is_map_shared then l.map_live else null::jsonb end,           -- map_live (#1073): the live layer's snapshot, likewise
    case when l.is_map_shared then l.map_layer_stand_url else null::text end,      -- map_layer_stand_url (#1073): the Drawing's standing layer
    case when l.is_map_shared then l.map_layer_stand_live_url else null::text end, -- map_layer_stand_live_url (#1073): the same, less what sways
    l.climate,                                                                -- climate (#1086): the weather a player sees comes from it
    l.terrain,                                                                -- terrain (#1086): which weather hazards apply there
    null::jsonb,                                                              -- map_motion (#1125): a moving map plays only on the DM's own device
    l.book_nook_id,                                                            -- book_nook_id (#1142): the picture a visible place shows
    l.shared_with_party                                   -- shared_with_party (#1259): whether a later joiner sees it too
  from locations l
  where l.campaign_id is not null
    and (p_campaign_id is null or l.campaign_id = p_campaign_id)
    and (p_location_id is null or l.id = p_location_id)
    and exists (
      select 1 from campaign_members cm
      where cm.user_id = (select auth.uid())
        and cm.campaign_id = l.campaign_id
    )
    and (
      exists (
        select 1 from campaign_members cm
        where cm.user_id = (select auth.uid())
          and cm.campaign_id = l.campaign_id
          and cm.party_member_id = any (l.player_visible_to)
      )
      or (p_location_id is not null and l.is_map_shared = true)
    )
$function$;

CREATE OR REPLACE FUNCTION public.get_player_visible_notes(p_campaign_id uuid, p_preview_member_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF notes
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
  select
    n.id,
    n.user_id,
    n.title,
    private.withhold_secret_blocks(n.content),
    n.tags,
    n.is_pinned,
    n.created_at,
    n.updated_at,
    n.campaign_id,
    n.is_player_visible,
    n.player_visible_to,
    n.session_start_year,
    n.session_start_month,
    n.session_start_day,
    n.session_end_year,
    n.session_end_month,
    n.session_end_day,
    n.session_real_date,
    n.linked_calendar_event_id,
    n.sort_order,
    n.ai_provenance,
    null::text,                          -- demo_source (#912): a quota marker, nothing for players
    n.session_id,
    -- The reading (below): a player hears a note they may read, so they are told it has one.
    n.reading_hash,
    n.reading_voice,
    n.reading_chars,
    n.reading_at,
    n.shared_with_party                                   -- shared_with_party (#1259): whether a later joiner sees it too
  from notes n
  where n.campaign_id = p_campaign_id
    and (
      exists (
        select 1 from campaign_members cm
         where cm.campaign_id = n.campaign_id
           and cm.user_id = (select auth.uid())
           and cm.party_member_id = any (n.player_visible_to)
      )
      or (
        private.is_campaign_dm(n.campaign_id)
        and case
          when p_preview_member_id is not null then p_preview_member_id = any (n.player_visible_to)
          else array_length(n.player_visible_to, 1) is not null
        end
      )
    )
$function$;

CREATE OR REPLACE FUNCTION public.get_player_visible_puzzles(p_campaign_id uuid DEFAULT NULL::uuid, p_puzzle_id uuid DEFAULT NULL::uuid, p_preview_party_member_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF puzzle_rooms
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if p_preview_party_member_id is not null and not exists (
    select 1
    from public.party_members pm
    where pm.id = p_preview_party_member_id
      and (p_campaign_id is null or pm.campaign_id = p_campaign_id)
      and coalesce(private.is_campaign_dm(pm.campaign_id), false)
  ) then
    raise exception 'Preview audience is not available to this DM';
  end if;

  return query select
    p.id,
    p.user_id,
    p.name,
    p.puzzle_type,
    p.difficulty,
    private.withhold_secret_blocks(p.description),   -- player-facing "The Room" setup
    null::text,                          -- solution (DM-only)
    -- hints: keep only the entries the DM has revealed via shared_hints
    coalesce((
      select jsonb_agg(h order by (h->>'order')::int)
      from jsonb_array_elements(coalesce(p.hints, '[]'::jsonb)) h
      where (h->>'order')::int = any (coalesce(p.shared_hints, array[]::int[]))
    ), '[]'::jsonb),
    p.skill_checks,                      -- skill + DC are shown to players
    null::text,                          -- success_outcome (DM-only)
    null::text,                          -- failure_consequence (DM-only)
    p.image_url,
    p.image_focal_point,
    p.tags,
    null::text,                          -- notes (DM-only)
    p.created_at,
    p.updated_at,
    p.campaign_id,
    p.is_shared,
    p.shared_hints,
    private.withhold_secret_blocks(p.read_aloud),
    null::uuid,                          -- location_id (DM-only anchor)
    null::uuid,                          -- dungeon_feature_id (DM-only anchor)
    p.ai_provenance,
    p.player_visible_to,
    null::text,                          -- demo_source (#912): a quota marker, nothing for players
    null::text,                           -- library_dungeon_feature_id (#1060): DM-only anchor
    p.shared_with_party                                   -- shared_with_party (#1259): whether a later joiner sees it too
  from puzzle_rooms p
  where p.campaign_id is not null
    and (p_campaign_id is null or p.campaign_id = p_campaign_id)
    and (p_puzzle_id   is null or p.id = p_puzzle_id)
    and case
      when p_preview_party_member_id is null then private.is_puzzle_player_visible(p.id)
      else p_preview_party_member_id = any (p.player_visible_to)
        and coalesce(private.is_campaign_dm(p.campaign_id), false)
    end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_player_visible_npcs(p_campaign_id uuid DEFAULT NULL::uuid, p_location_ids uuid[] DEFAULT NULL::uuid[], p_preview_member_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF npcs
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    s.id,
    s.user_id,
    case
      when not ('name' = any (s.player_visible_fields)) then null
      when s.concealed and s.disguise_name is not null then s.disguise_name
      else s.name
    end,
    case when 'race' = any (s.player_visible_fields) then s.race else null end,
    null::text,                                            -- alignment (DM-only)
    null::text,                                            -- age (DM-only)
    case when 'occupation' = any (s.player_visible_fields) then s.occupation else null end,
    null::text,                                            -- appearance (DM-only)
    null::text,                                            -- personality (DM-only)
    null::text,                                            -- backstory (DM-only)
    null::text,                                            -- notes (DM-only)
    s.status,
    s.relationship,
    case
      when not ('portrait' = any (s.player_visible_fields)) then null
      when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_url
      else s.portrait_url
    end,
    null::text[],                                          -- tags (DM-only; no player toggle)
    null::jsonb,                                           -- stat_block (DM-only)
    null::uuid,                                            -- scriptorium_doc_id (DM-only)
    s.created_at,
    s.updated_at,
    s.campaign_id,
    case when 'location' = any (s.player_visible_fields) then s.location_id else null::uuid end,
    s.player_visible_fields,
    case
      when not ('portrait' = any (s.player_visible_fields)) then null
      when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_focal_point
      else s.portrait_focal_point
    end,
    null::uuid,                                            -- linked_monster_id (DM-only)
    s.relevance,
    s.player_visible_to,
    -- The cover the party knew, only once it has fallen (unmasked_at set).
    case when s.unmasked and 'name' = any (s.player_visible_fields) then s.disguise_name else null end,
    case when s.unmasked and 'portrait' = any (s.player_visible_fields) then s.disguise_portrait_url else null end,
    case when s.unmasked and 'portrait' = any (s.player_visible_fields) then s.disguise_portrait_focal_point else null end,
    false,                                                 -- is_revealed (cover shown; never leak true state)
    s.ai_provenance,
    null::text,                                            -- demo_source (#912): a quota marker, nothing for players
    case                                                   -- cutout_url (#917): the true form, so never for a concealed NPC
      when not ('portrait' = any (s.player_visible_fields)) then null
      when s.concealed then null
      else s.cutout_url
    end,
    case when s.unmasked then s.unmasked_at else null end, -- unmasked_at: when the card turns
    null::integer,                                         -- born_year (#1086; DM-only, like age)
    null::integer,                                         -- born_month
    null::integer,                                         -- born_day
    null::integer,                                         -- died_year (DM-only, like the birth date)
    null::integer,                                         -- died_month
    null::integer,                                         -- died_day
    s.size,                                                -- size (#1125): the token on the battle map shows it anyway
    null::text,                                            -- voice (#1021; DM-only, like personality)
    null::uuid,                                             -- speech_voice_id (#1272; DM-only: which voice reads them aloud)
    s.shared_with_party                                   -- shared_with_party (#1259): whether a later joiner sees it too
  from (
    select n.*,
      ((n.disguise_name is not null or n.disguise_portrait_url is not null)
        and not n.is_revealed) as concealed,
      (n.is_revealed and n.unmasked_at is not null
        and (n.disguise_name is not null or n.disguise_portrait_url is not null)) as unmasked
    from npcs n
    where (p_campaign_id is null or n.campaign_id = p_campaign_id)
      and (p_location_ids is null or n.location_id = any (p_location_ids))
      and (
        -- (a) individually shared with the caller
        exists (
          select 1 from campaign_members cm
          where cm.user_id = (select auth.uid())
            and cm.campaign_id = n.campaign_id
            and cm.party_member_id = any (n.player_visible_to)
        )
        -- (b) shared via the NPC's OWN location ("Share linked NPCs" on that
        --     location, shared with the caller) — direct location only.
        or exists (
          select 1 from locations l
          join campaign_members cm
            on cm.user_id = (select auth.uid()) and cm.campaign_id = l.campaign_id
          where l.id = n.location_id
            and l.is_npcs_shared
            and cm.party_member_id = any (l.player_visible_to)
        )
        -- (c) DM preview: the campaign DM sees exactly what the previewed member
        --     would see (individually shared, or location-shared to that member);
        --     with no member chosen, anything shared with at least one member.
        or (
          private.is_campaign_dm(n.campaign_id)
          and (
            (p_preview_member_id is not null and (
              p_preview_member_id = any (n.player_visible_to)
              or exists (
                select 1 from locations l
                where l.id = n.location_id
                  and l.is_npcs_shared
                  and p_preview_member_id = any (l.player_visible_to)
              )
            ))
            or (p_preview_member_id is null and (
              array_length(n.player_visible_to, 1) is not null
              or exists (
                select 1 from locations l
                where l.id = n.location_id
                  and l.is_npcs_shared
                  and array_length(l.player_visible_to, 1) is not null
              )
            ))
          )
        )
      )
  ) s;
$function$;

-- ─── A passage widened by the party changing is the server's write ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.guard_player_passage()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- A server write (the AI table telling a passage, a demo copy, a content move) has no signed-in user and is not a
  -- player's; the DM may do anything here.
  -- The party changing (#1259) widens a passage told to the whole party to the newcomer: the server's write, not the
  -- signed-in player's, though it runs in their transaction when they join.
  if (select auth.uid()) is null or private.is_campaign_dm(new.campaign_id)
     or current_setting('grimoire.party_join', true) = 'on' then
    return new;
  end if;
  -- Where a passage comes out is the DM's to set: a player may not place one, nor move a place the DM set, but may
  -- still edit the words of a passage the DM placed.
  if new.author_id is distinct from (select auth.uid())
     or (tg_op = 'INSERT' and (new.location_id is not null or new.npc_id is not null or new.quest_beat_id is not null))
     or (tg_op = 'UPDATE' and (new.location_id is distinct from old.location_id
                               or new.npc_id is distinct from old.npc_id
                               or new.quest_beat_id is distinct from old.quest_beat_id))
     or (tg_op = 'UPDATE' and new.author_id is distinct from old.author_id)
     or exists (select 1 from unnest(new.player_visible_to) m
                 where not exists (select 1 from public.party_members pm
                                    where pm.id = m and pm.campaign_id = new.campaign_id)) then
    raise exception using errcode = '42501', message = 'A player writes only their own passages, told to their party';
  end if;
  -- Told when written: a player's passage is told to whoever it is shared with, at once.
  if new.told_at is null then
    new.told_at := now();
  end if;
  return new;
end;
$function$;

-- ─── The Open Book's whole party is the same party ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.open_book_snapshot(p_campaign_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_book public.open_books;
  v_campaign public.campaigns;
  v_party uuid[];
  v_places jsonb := '[]'::jsonb;
  v_folk jsonb := '[]'::jsonb;
  v_factions jsonb := '[]'::jsonb;
  v_pantheons jsonb := '[]'::jsonb;
  v_deities jsonb := '[]'::jsonb;
  v_lore jsonb := '[]'::jsonb;
  v_truths jsonb := '[]'::jsonb;
  v_sessions jsonb := '[]'::jsonb;
  v_events jsonb := '[]'::jsonb;
  v_names jsonb := '{}'::jsonb;
  v_cited uuid[];
  v_entry_ids uuid[];
  v_ties jsonb := '[]'::jsonb;
  v_concealed uuid[];
begin
  select * into v_book from public.open_books where campaign_id = p_campaign_id;
  if not found then
    return null;
  end if;
  select * into v_campaign from public.campaigns where id = p_campaign_id;
  -- The whole party is the party at the table (#1259): a fallen character is not someone the book waits for.
  v_party := private.active_party(p_campaign_id);

  if 'atlas' = any (v_book.chapters) then
    -- As get_player_visible_locations: description and map only when shared, DM notes and audio never, and
    -- only the pins players may see.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', l.id,
             'parent_id', l.parent_id,
             'name', l.name,
             'location_type', l.location_type,
             'player_summary', l.player_summary,
             'description', case when l.is_description_shared then private.withhold_secret_blocks(l.description) end,
             'image_url', l.image_url,
             'tags', to_jsonb(l.tags),
             'is_level', l.is_level,
             'is_battle_map', l.is_battle_map,
             'npcs_shared', l.is_npcs_shared,
             'map', case when l.is_map_shared then jsonb_build_object(
                      'url', l.map_url,
                      'layer_url', l.map_layer_url,
                      'layer_calibration', l.map_layer_calibration,
                      'plan_size', l.plan_size,
                      'scale', l.map_scale) end,
             'pins', coalesce((
                      select jsonb_agg(pin)
                        from jsonb_array_elements(coalesce(l.map_pins, '[]'::jsonb)) pin
                       where coalesce((pin->>'visible_to_players')::boolean, false)), '[]'::jsonb)
           ) order by l.sort_order nulls last, l.name), '[]'::jsonb)
      into v_places
      from public.locations l
     where l.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'location', l.id,
             private.open_book_whole_party(l.player_visible_to, v_party), v_book.include_shared);
  end if;

  if 'folk' = any (v_book.chapters) then
    -- As get_player_visible_npcs: only the fields the DM shares, the cover while a disguise holds, the cover the
    -- party knew once it falls, and no prose (players are never shown an NPC's appearance, personality or
    -- backstory). A person whose name is not shared has no page to be on.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', s.id,
             'name', case when s.concealed and s.disguise_name is not null then s.disguise_name else s.name end,
             'race', case when 'race' = any (s.player_visible_fields) then s.race end,
             'occupation', case when 'occupation' = any (s.player_visible_fields) then s.occupation end,
             'status', s.status,
             'relationship', s.relationship,
             'portrait_url', case
                when not ('portrait' = any (s.player_visible_fields)) then null
                when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_url
                else s.portrait_url end,
             'portrait_focal_point', case
                when not ('portrait' = any (s.player_visible_fields)) then null
                when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_focal_point
                else s.portrait_focal_point end,
             'cutout_url', case when 'portrait' = any (s.player_visible_fields) and not s.concealed then s.cutout_url end,
             'location_id', case when 'location' = any (s.player_visible_fields) then s.location_id end,
             'former_name', case when s.unmasked then s.disguise_name end,
             'former_portrait_url', case when s.unmasked and 'portrait' = any (s.player_visible_fields) then s.disguise_portrait_url end
           ) order by s.name), '[]'::jsonb)
      into v_folk
      from (
        select n.*,
          ((n.disguise_name is not null or n.disguise_portrait_url is not null) and not n.is_revealed) as concealed,
          (n.is_revealed and n.unmasked_at is not null
            and (n.disguise_name is not null or n.disguise_portrait_url is not null)) as unmasked
          from public.npcs n
         where n.campaign_id = p_campaign_id
           and 'name' = any (n.player_visible_fields)
      ) s
     where private.open_book_takes(p_campaign_id, 'npc', s.id,
             private.open_book_whole_party(s.player_visible_to, v_party)
             -- or shared with the party through the place they live, as the projection's arm (b)
             or exists (
               select 1 from public.locations l
                where l.id = s.location_id
                  and l.is_npcs_shared
                  and private.open_book_whole_party(l.player_visible_to, v_party)),
             v_book.include_shared);
  end if;

  if 'factions' = any (v_book.chapters) then
    -- As get_player_visible_factions: descent is the party's to know, the succession custom is not.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', f.id,
             'name', f.name,
             'faction_type', f.faction_type,
             'description', private.withhold_secret_blocks(f.description),
             'emblem_url', f.emblem_url,
             'alignment', f.alignment,
             'tags', to_jsonb(f.tags),
             'party_standing', f.party_standing,
             'descent', f.descent
           ) order by f.name), '[]'::jsonb)
      into v_factions
      from public.factions f
     where f.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'faction', f.id,
             private.open_book_whole_party(f.player_visible_to, v_party), v_book.include_shared);
  end if;

  if 'pantheon' = any (v_book.chapters) then
    -- Players read pantheons and deities as raw rows (DM notes on them live in entity_notes, which the book never
    -- reads); the book also strips the secret blocks the raw read would show.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', p.id,
             'name', p.name,
             'description', private.withhold_secret_blocks(p.description),
             'emblem_url', p.emblem_url,
             'tags', to_jsonb(p.tags)
           ) order by p.name), '[]'::jsonb)
      into v_pantheons
      from public.pantheons p
     where p.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'pantheon', p.id,
             private.open_book_whole_party(p.player_visible_to, v_party), v_book.include_shared);

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', d.id,
             'pantheon_id', d.pantheon_id,
             'name', d.name,
             'titles', d.titles,
             'alternate_names', to_jsonb(d.alternate_names),
             'alignment', d.alignment,
             'symbol', d.symbol,
             'symbol_image_url', d.symbol_image_url,
             'portrait_url', d.portrait_url,
             'portrait_focal_point', d.portrait_focal_point,
             'domains', to_jsonb(d.domains),
             'portfolio', d.portfolio,
             'description', private.withhold_secret_blocks(d.description),
             'tags', to_jsonb(d.tags)
           ) order by d.name), '[]'::jsonb)
      into v_deities
      from public.deities d
     where d.campaign_id = p_campaign_id
       and private.open_book_takes(p_campaign_id, 'deity', d.id,
             private.open_book_whole_party(d.player_visible_to, v_party), v_book.include_shared);
  end if;

  if 'lore' = any (v_book.chapters) then
    -- The canon (#1226): lore the whole party can read, told as far as the whole party has been told it (the first
    -- passage with the entry, a later one once every member has heard it), and the truths known to all. Never a
    -- secret, a force, an open question or a truth known only to some.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', e.id,
             'title', e.title,
             'lore_kind', e.lore_kind,
             'world_date', case when e.world_year is not null then jsonb_build_object(
                             'year', e.world_year, 'month', e.world_month, 'day', e.world_day) end,
             'image_url', e.image_url,
             'body', private.withhold_secret_blocks(e.body),
             'passages', (
               select coalesce(jsonb_agg(jsonb_build_object(
                        'id', p.id,
                        'title', p.title,
                        'body', private.withhold_secret_blocks(p.body)
                      ) order by p.sort_order, p.created_at), '[]'::jsonb)
                 from public.canon_lore_passages p
                where p.entry_id = e.id
                  and (p.id = (select f.id from public.canon_lore_passages f where f.entry_id = e.id
                                order by f.sort_order, f.created_at limit 1)
                       or private.open_book_whole_party(p.player_visible_to, v_party))),
             'created_at', e.created_at
           ) order by e.world_year nulls last, e.world_month nulls last, e.world_day nulls last, e.sort_order, e.title),
           '[]'::jsonb)
      into v_lore
      from public.canon_entries e
     where e.campaign_id = p_campaign_id
       and e.part = 'lore'
       and private.open_book_takes(p_campaign_id, 'canon', e.id,
             private.open_book_whole_party(e.player_visible_to, v_party), v_book.include_shared);

    select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title) order by e.sort_order, e.created_at),
           '[]'::jsonb)
      into v_truths
      from public.canon_entries e
     where e.campaign_id = p_campaign_id
       and e.part = 'truth' and e.knowledge = 'all'
       and private.open_book_takes(p_campaign_id, 'canon', e.id, true, v_book.include_shared);
  end if;

  if 'chronicle' = any (v_book.chapters) then
    -- The Chronicle: a note linked to a session is that session's chronicle entry (#1226 story 6), with the session.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', n.id,
             'title', n.title,
             'content', private.withhold_secret_blocks(n.content),
             'tags', to_jsonb(n.tags),
             'session', case when cs.id is not null then jsonb_build_object(
                          'number', cs.number, 'title', cs.title, 'played_on', cs.played_on) end,
             'date', case when n.session_start_year is not null then jsonb_build_object(
                       'year', n.session_start_year, 'month', n.session_start_month, 'day', n.session_start_day,
                       'end_year', n.session_end_year, 'end_month', n.session_end_month, 'end_day', n.session_end_day) end,
             'real_date', n.session_real_date,
             'created_at', n.created_at
           ) order by cs.number nulls last, n.session_real_date nulls last, n.created_at), '[]'::jsonb)
      into v_sessions
      from public.notes n
      left join public.campaign_sessions cs on cs.id = n.session_id
     where n.campaign_id = p_campaign_id
       and n.session_id is not null
       and private.open_book_takes(p_campaign_id, 'note', n.id,
             private.open_book_whole_party(n.player_visible_to, v_party), v_book.include_shared);

    -- The calendar players already read (calendar_events_select): shown events and every session. Never the
    -- DM's links to quests, encounters or places.
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', e.id,
             'title', e.title,
             'description', private.withhold_secret_blocks(e.description),
             'event_type', e.event_type,
             'year', e.year, 'month', e.month, 'day', e.day,
             'festival_day', e.festival_day,
             'is_multi_day', e.is_multi_day,
             'end_year', e.end_year, 'end_month', e.end_month, 'end_day', e.end_day,
             'color', e.color
           ) order by e.year nulls last, e.month nulls last, e.day nulls last), '[]'::jsonb)
      into v_events
      from public.calendar_events e
     where e.campaign_id = p_campaign_id
       and (e.player_visible or e.event_type = 'session');
  end if;

  -- Rich text mentions people and places by id only (entityMention stores no label), so the book carries a
  -- name for every id its own pages cite, when the whole table can already read that name: the party's
  -- characters, people under their cover, places and factions. Only cited ids: an entry the DM took out keeps
  -- its name out of the book unless released text names it. A mention of anything else stays unnamed.
  -- Cited means an entityMention in the released text, nothing else: a place's parent_id, a pin or a file name
  -- also hold ids, and reading those would name a place the DM took out (#1085 audit).
  select coalesce(array_agg(distinct c.id), '{}'::uuid[])
    into v_cited
    from (
      select jsonb_path_query(v_places, '$[*].description') #>> '{}' as doc
      union all select jsonb_path_query(v_factions, '$[*].description') #>> '{}'
      union all select jsonb_path_query(v_pantheons, '$[*].description') #>> '{}'
      union all select jsonb_path_query(v_deities, '$[*].description') #>> '{}'
      union all select jsonb_path_query(v_lore, '$[*].body') #>> '{}'
      union all select jsonb_path_query(v_lore, '$[*].passages[*].body') #>> '{}'
      union all select jsonb_path_query(v_sessions, '$[*].content') #>> '{}'
      union all select jsonb_path_query(v_events, '$[*].description') #>> '{}'
    ) t
    cross join lateral unnest(private.open_book_mentions(t.doc)) as c(id);

  select coalesce(jsonb_object_agg(x.id::text, x.name), '{}'::jsonb)
    into v_names
    from (
      select pm.id, pm.name from public.party_members pm where pm.campaign_id = p_campaign_id
      union all
      select n.id,
             case when (n.disguise_name is not null or n.disguise_portrait_url is not null) and not n.is_revealed
                       and n.disguise_name is not null
                  then n.disguise_name else n.name end
        from public.npcs n
       where n.campaign_id = p_campaign_id
         and 'name' = any (n.player_visible_fields)
         and (private.open_book_whole_party(n.player_visible_to, v_party)
              or exists (
                select 1 from public.locations l
                 where l.id = n.location_id
                   and l.is_npcs_shared
                   and private.open_book_whole_party(l.player_visible_to, v_party)))
      union all
      select l.id, l.name from public.locations l
       where l.campaign_id = p_campaign_id and private.open_book_whole_party(l.player_visible_to, v_party)
      union all
      select f.id, f.name from public.factions f
       where f.campaign_id = p_campaign_id and private.open_book_whole_party(f.player_visible_to, v_party)
    ) x
   where x.name is not null
     and x.id = any (v_cited);

  -- World Web (#1084): the ties between two entries that are both in the book, as cross-references. The book
  -- never runs ahead of the table: a link only once the whole party knows it, a record by the rule the player
  -- projection already applies (a membership once the whole party knows it, never a disguised NPC's; a home only where
  -- the NPC's location is shared).
  -- A tie to anything not in this release is left out, so a reader can follow every one to its page.
  select coalesce(array_agg(distinct x.id), '{}'::uuid[]) into v_entry_ids
    from (
      select (e->>'id')::uuid as id from jsonb_array_elements(v_places) e
      union all select (e->>'id')::uuid from jsonb_array_elements(v_folk) e
      union all select (e->>'id')::uuid from jsonb_array_elements(v_factions) e
      union all select (e->>'id')::uuid from jsonb_array_elements(v_deities) e
      union all select (e->>'id')::uuid from jsonb_array_elements(v_lore) e
    ) x;

  -- A disguised NPC is in the book under the cover; the true one's allegiances and family stay out until it falls.
  select coalesce(array_agg(n.id), '{}'::uuid[]) into v_concealed
    from public.npcs n
   where n.campaign_id = p_campaign_id and not n.is_revealed
     and (n.disguise_name is not null or n.disguise_portrait_url is not null);

  select coalesce(jsonb_agg(jsonb_build_object(
           'source', t.source, 'type', t.type,
           'from_kind', t.from_kind, 'from_id', t.from_id, 'to_kind', t.to_kind, 'to_id', t.to_id,
           'told', t.told)
           order by t.source, t.type, t.from_id, t.to_id), '[]'::jsonb)
    into v_ties
    from (
      select 'link' as source, l.type, l.from_kind, l.from_id, l.to_kind, l.to_id, nullif(l.told, '') as told
        from public.world_links l
       where l.campaign_id = p_campaign_id and private.open_book_whole_party(l.player_visible_to, v_party)
      union all
      select 'membership', 'member_of', 'npc', m.npc_id, 'faction', m.faction_id, null
        from public.faction_npcs m join public.factions f on f.id = m.faction_id
       where f.campaign_id = p_campaign_id
         and private.open_book_whole_party(m.player_visible_to, v_party)
         and m.npc_id <> all (v_concealed)
      union all
      select 'npc_home', 'lives_in', 'npc', n.id, 'location', n.location_id, null
        from public.npcs n
       where n.campaign_id = p_campaign_id and n.location_id is not null and 'location' = any (n.player_visible_fields)
      union all
      select 'seat', 'seat', 'faction', f.id, 'location', f.seat_location_id, null
        from public.factions f where f.campaign_id = p_campaign_id and f.seat_location_id is not null
      union all
      select 'kin', k.kind || '_of', 'npc', k.from_npc_id, 'npc', k.to_npc_id, null
        from public.kin_links k
       where k.campaign_id = p_campaign_id and k.from_npc_id is not null and k.to_npc_id is not null
         and k.from_npc_id <> all (v_concealed) and k.to_npc_id <> all (v_concealed)
    ) t
   where t.from_id = any (v_entry_ids) and t.to_id = any (v_entry_ids);

  return jsonb_build_object(
    'v', 2,
    'book', jsonb_build_object(
      'title', v_book.title,
      'subtitle', v_book.subtitle,
      'cover_art', v_book.cover_art,
      'cover_image_url', v_book.cover_image_url,
      'leather', v_book.leather,
      'chapters', to_jsonb(v_book.chapters),
      'campaign_name', v_campaign.name),
    'calendar', jsonb_build_object(
      'calendar_id', v_campaign.calendar_id,
      'custom_calendar', v_campaign.custom_calendar,
      'current', jsonb_build_object('year', v_campaign.current_year, 'month', v_campaign.current_month, 'day', v_campaign.current_day)),
    'places', v_places,
    'folk', v_folk,
    'factions', v_factions,
    'pantheons', v_pantheons,
    'deities', v_deities,
    'lore', v_lore,
    'truths', v_truths,
    'sessions', v_sessions,
    'events', v_events,
    'names', v_names,
    'ties', v_ties,
    'stats', jsonb_build_object(
      'places', jsonb_array_length(v_places),
      'folk', jsonb_array_length(v_folk),
      'factions', jsonb_array_length(v_factions),
      'pantheons', jsonb_array_length(v_pantheons),
      'deities', jsonb_array_length(v_deities),
      'lore', jsonb_array_length(v_lore),
      'truths', jsonb_array_length(v_truths),
      'sessions', jsonb_array_length(v_sessions),
      'events', jsonb_array_length(v_events))
  );
end;
$function$;

-- ─── The rows shared before today ───────────────────────────────────────────────────────────────────────────────────

-- What a past share meant is not recorded, so it is read from the evidence, conservatively: a row was shared with the
-- whole party when it lists at least two characters still at the table and every character at the table who already
-- existed when it was shared. It cannot have been shared before the row existed nor before the newest character it
-- lists was made, so the later of those two moments stands in for the share. Those rows get the flag and every
-- character at the table, which is what reaches a replacement character such as one made after a death.
--
-- Read the other way: a secret shown to one character never widens; nor does one kept from a character who was
-- already there when it was shared; nor does anything shared before the party had two characters.
do $$
declare
  t text;
  v_campaign_of text;
begin
  perform set_config('grimoire.party_join', 'on', true);
  foreach t in array array[
    'canon_entries', 'canon_lore_passages', 'crafting_recipes', 'deities', 'faction_npcs', 'faction_party_members',
    'factions', 'locations', 'notes', 'npc_memories', 'npcs', 'pantheons', 'puzzle_rooms', 'scriptorium_documents',
    'world_links'
  ] loop
    v_campaign_of := case
      when t in ('faction_npcs', 'faction_party_members') then
        '(select f.campaign_id from public.factions f where f.id = x.faction_id)'
      else 'x.campaign_id'
    end;
    execute format($q$
      with scoped as (
        select x.id, %2$s as campaign_id, x.created_at, x.player_visible_to
          from public.%1$I x
         where cardinality(x.player_visible_to) >= 2
      ),
      judged as (
        select s.id, private.active_party(s.campaign_id) as party, s.player_visible_to, s.created_at,
               (select max(pm.created_at) from public.party_members pm
                 where pm.id = any (s.player_visible_to) and pm.id = any (private.active_party(s.campaign_id))) as newest_listed
          from scoped s
         where s.campaign_id is not null
      ),
      whole_party as (
        select j.id, j.party
          from judged j
         where j.newest_listed is not null
           and (select count(*) from unnest(j.party) m where m = any (j.player_visible_to)) >= 2
           and not exists (
             select 1 from public.party_members pm
              where pm.id = any (j.party)
                and pm.created_at <= greatest(j.created_at, j.newest_listed)
                and not pm.id = any (j.player_visible_to)
           )
      )
      update public.%1$I x
         set player_visible_to = array(select distinct m from unnest(x.player_visible_to || w.party) m order by m),
             shared_with_party = true
        from whole_party w
       where w.id = x.id
    $q$, t, v_campaign_of);
  end loop;
  perform set_config('grimoire.party_join', '', true);
end;
$$;

-- And the definition itself, for every campaign: a row that already lists everyone at the table is shared with the
-- whole party, as the stamp would have said had it existed when the row was written.
select private.reconcile_party_shares(c.id) from public.campaigns c;

-- A discovered monster already has a word for the whole party, now and later: `visible_to is null`. The bestiary's
-- "Whole party" wrote today's ids instead, so the same reading turns those lists back into `null`.
update public.discovered_monsters d
   set visible_to = null
 where cardinality(d.visible_to) >= 2
   and (select count(*) from unnest(private.active_party(d.campaign_id)) m where m = any (d.visible_to)) >= 2
   and not exists (
     select 1 from public.party_members pm
      where pm.id = any (private.active_party(d.campaign_id))
        and not pm.id = any (d.visible_to)
        and pm.created_at <= greatest(
              d.discovered_at,
              (select max(l.created_at) from public.party_members l
                where l.id = any (d.visible_to) and l.id = any (private.active_party(d.campaign_id))))
   );
