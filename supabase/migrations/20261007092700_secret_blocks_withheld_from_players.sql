-- Migration: secret_blocks_withheld_from_players
-- A "DM only" passage inside shared rich text never reaches a player (#932, story 4).
--
-- The DM can mark a block inside a note, a place's description, a faction's
-- description, an item's text or a puzzle's text as theirs alone: a
-- `secretBlock` node in the Tiptap JSON. The rest of the text is shared as
-- before. The block is **withheld by the server**, not hidden by the client,
-- for the same reason as the NPC disguise rule: a secret the client never
-- receives cannot be read from devtools, a downloaded JSON or a realtime
-- payload, and one the client is merely asked not to show can.
--
-- ── What this changes ────────────────────────────────────────────────────────
--
-- 1. `private.withhold_secret_blocks(text)` strips every `secretBlock` node, at
--    any depth, from a stored Tiptap JSON string. It fails closed: a value that
--    looks like JSON but cannot be parsed, or that still holds a secret block
--    after the strip, is withheld entirely.
-- 2. The three projections that already return rich text (locations, items,
--    puzzles) run their rich columns through it.
-- 3. Notes and factions were read by players straight from the tables
--    (`notes_select`'s player branch, `factions_player_select`,
--    `factions_member_select`), so the full column, secret included, was one
--    REST call or one realtime payload away. A policy filters rows, not
--    columns, so those player branches go, as `npcs_player_select` did in
--    20260928233302, and players read through two new projections:
--    `get_player_visible_notes` and `get_player_visible_factions`.
-- 4. Live updates: with no row a player may read, a player's subscription to
--    `notes` / `factions` carries nothing, so both tables ring the
--    `campaign_sync` doorbell on insert and update under a player-only signal
--    name (`notes_player`, `factions_player`), exactly the `npcs_player` move.
--    The DM keeps the row events. Delete keeps ringing under the table name.
-- 5. `faction_deities_player_select` joined `factions` as the caller, so it
--    quietly relied on the player reading the row. It now asks
--    `private.faction_is_visible_to_caller`, which answers the same question
--    without handing out the row.

-- ── 1. The stripper ─────────────────────────────────────────────────────────

-- Recursive over the node tree. Tiptap nests children only under `content`,
-- so a node without a `content` array is returned untouched. A container the
-- strip leaves empty is dropped with it (returns null), because `listItem`,
-- `blockquote`, `column` and the like require at least one block and an empty
-- one would be invalid; dropping it also leaves no blank where the secret was.
-- The two containers that cannot be dropped without breaking their parent,
-- the document and a table cell, keep one empty paragraph instead.
create or replace function private.strip_secret_nodes(p_node jsonb)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_content jsonb;
begin
  if jsonb_typeof(p_node) <> 'object'
     or jsonb_typeof(p_node -> 'content') is distinct from 'array' then
    return p_node;
  end if;

  select coalesce(jsonb_agg(s.kept order by s.ord), '[]'::jsonb)
    into v_content
    from (
      select private.strip_secret_nodes(e.child) as kept, e.ord
        from jsonb_array_elements(p_node -> 'content') with ordinality as e(child, ord)
       where not (jsonb_typeof(e.child) = 'object' and e.child ->> 'type' = 'secretBlock')
    ) s
   where s.kept is not null;

  if jsonb_array_length(p_node -> 'content') > 0 and jsonb_array_length(v_content) = 0 then
    if p_node ->> 'type' in ('doc', 'tableCell', 'tableHeader') then
      return jsonb_set(p_node, '{content}', '[{"type":"paragraph"}]'::jsonb);
    end if;
    return null;
  end if;

  return jsonb_set(p_node, '{content}', v_content);
end;
$$;

create or replace function private.withhold_secret_blocks(p_value text)
returns text
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_doc jsonb;
  v_out jsonb;
begin
  -- Plain text and legacy HTML predate the editor's JSON and cannot hold a
  -- secret block, so they pass through as they are. `\s` and not `ltrim`:
  -- JSON allows a leading newline or tab, and a value that parses as JSON must
  -- never skip the strip because of one. A stored document is always an
  -- object, so prose that happens to open with "[" is left alone.
  if p_value is null or p_value !~ '^\s*{' then
    return p_value;
  end if;

  begin
    v_doc := p_value::jsonb;
  exception when others then
    -- Fail closed. Something that looks like JSON but does not parse cannot be
    -- checked, and the viewer would print it raw: withhold it whole. Losing a
    -- garbled description is better than printing a secret.
    return null;
  end;

  -- The check runs on the parsed value, so an escaped spelling of the type
  -- name is decoded before it is compared.
  if not jsonb_path_exists(v_doc, 'strict $.** ? (@.type == "secretBlock")') then
    return p_value;
  end if;

  v_out := private.strip_secret_nodes(v_doc);

  -- The strip removes blocks from `content` arrays, the only place the editor
  -- writes one. A secret anywhere else (hand-edited JSON, a future importer)
  -- would survive it, so the result is checked again and withheld whole.
  if v_out is null or jsonb_path_exists(v_out, 'strict $.** ? (@.type == "secretBlock")') then
    return null;
  end if;

  return v_out::text;
end;
$$;

-- Called only from SECURITY DEFINER projections, which run as their owner, so
-- no client role needs it.
revoke execute on function private.strip_secret_nodes(jsonb) from public, anon, authenticated;
revoke execute on function private.withhold_secret_blocks(text) from public, anon, authenticated;

-- ── 2. The projections that already return rich text ───────────────────────

create or replace function public.get_player_visible_locations(p_campaign_id uuid default null::uuid, p_location_id uuid default null::uuid)
 returns setof locations
 language sql
 stable security definer
 set search_path to 'public'
as $function$
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
    case when l.is_map_shared then l.map_scale else null::jsonb end           -- map_scale (#932): travels with the map
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

create or replace function public.get_player_visible_items()
 returns setof items
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  with vault as (
    select pi.item_id,
           bool_and(pi.is_identified)  as all_identified,
           bool_and(pi.curse_revealed) as all_curse_revealed
    from party_inventory pi
    join campaign_members cm on cm.campaign_id = pi.campaign_id
    where cm.user_id = (select auth.uid())
      and pi.item_id is not null
    group by pi.item_id
  )
  select
    i.id,
    i.user_id,
    i.name,
    i.item_type,
    i.subtype,
    i.rarity,
    i.requires_attunement,
    i.attunement_requirements,
    i.weight,
    i.cost,
    i.damage_rolls,
    i.armor_class,
    i.properties,
    i.charges,
    i.recharge,
    i.spell_ids,
    case when v.item_id is not null and not v.all_identified then null else private.withhold_secret_blocks(i.description) end,
    i.source,
    i.tags,
    case when v.item_id is not null and not v.all_identified then null else i.image_url end,
    i.created_at,
    i.updated_at,
    case when v.item_id is not null and not v.all_identified then null else i.image_focal_point end,
    i.weapon_range,
    i.versatile_damage,
    i.source_title,
    i.source_url,
    case when v.item_id is not null and v.all_curse_revealed then private.withhold_secret_blocks(i.curse_description) else null end,
    i.is_arcane_focus,
    private.withhold_secret_blocks(i.mundane_description),
    i.mundane_image_url,
    i.mundane_image_focal_point,
    i.bundle_items,
    i.campaign_id,
    null::text,                      -- dm_notes (DM-only)
    i.ruleset,
    i.conceptual_key,
    i.source_document_key,
    i.source_record_key,
    i.source_revision,
    i.source_license,
    i.provenance,
    i.mastery,
    i.ai_provenance,
    case when v.item_id is not null and not v.all_identified then null else private.withhold_secret_blocks(i.content) end,
    i.content_player_writable,
    i.content_updated_at
  from items i
  left join vault v on v.item_id = i.id
  where
    exists (
      select 1
      from party_inventory pi
      join campaign_members cm on cm.campaign_id = pi.campaign_id
      where pi.item_id = i.id
        and cm.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from store_items si
      join locations l on l.id = si.location_id
      join campaign_members cm on cm.campaign_id = l.campaign_id
      where si.item_id = i.id
        and cm.user_id = (select auth.uid())
        and cm.party_member_id = any (l.player_visible_to)
        and l.is_inventory_shared = true
        and si.visible = true
    );
$function$;

create or replace function public.get_player_visible_puzzles(p_campaign_id uuid default null::uuid, p_puzzle_id uuid default null::uuid, p_preview_party_member_id uuid default null::uuid)
 returns setof puzzle_rooms
 language plpgsql
 stable security definer
 set search_path to 'public', 'private'
as $function$
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
    null::text                           -- demo_source (#912): a quota marker, nothing for players
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

-- ── 3. Notes and factions move behind projections ──────────────────────────

-- The question `factions_player_select` and `factions_member_select` used to
-- answer between them: the faction is shared with the caller's character, or
-- the caller's character belongs to it. Total by construction (CLAUDE.md
-- item 3): `exists` is never null and the coalesce keeps it that way.
create or replace function private.faction_is_visible_to_caller(p_faction_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce((
    select exists (
      select 1
        from factions f
        join campaign_members cm
          on cm.campaign_id = f.campaign_id
         and cm.user_id = (select auth.uid())
         and cm.role = 'player'
       where f.id = p_faction_id
         and (
           cm.party_member_id = any (f.player_visible_to)
           or exists (
             select 1 from faction_party_members fpm
              where fpm.faction_id = f.id
                and fpm.party_member_id = cm.party_member_id
           )
         )
    )
  ), false);
$$;

-- An RLS helper (faction_deities below): `authenticated` keeps EXECUTE or the
-- policy fails with "permission denied for function". `private` is not
-- exposed by PostgREST, so this is not an RPC endpoint.
revoke execute on function private.faction_is_visible_to_caller(uuid) from public, anon;
grant execute on function private.faction_is_visible_to_caller(uuid) to authenticated, service_role;

-- `p_preview_member_id`: the campaign's DM sees exactly what that member would
-- see; with no member chosen, anything shared with at least one member. Same
-- contract as `get_player_visible_npcs`, so "view as player" stays honest.
create or replace function public.get_player_visible_notes(p_campaign_id uuid, p_preview_member_id uuid default null::uuid)
 returns setof notes
 language sql
 stable security definer
 set search_path to 'public', 'private'
as $function$
  select
    n.id,
    n.user_id,
    n.title,
    private.withhold_secret_blocks(n.content),
    n.category,
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
    n.session_id
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

create or replace function public.get_player_visible_factions(p_campaign_id uuid, p_preview_member_id uuid default null::uuid)
 returns setof factions
 language sql
 stable security definer
 set search_path to 'public', 'private'
as $function$
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
    null::text                           -- demo_source (#912): a quota marker, nothing for players
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

revoke execute on function public.get_player_visible_notes(uuid, uuid) from public, anon;
grant execute on function public.get_player_visible_notes(uuid, uuid) to authenticated, service_role;
revoke execute on function public.get_player_visible_factions(uuid, uuid) from public, anon;
grant execute on function public.get_player_visible_factions(uuid, uuid) to authenticated, service_role;

-- The DM's own read of a note never needed the player branch: they own it.
drop policy if exists notes_select on public.notes;
create policy notes_select on public.notes
  for select
  using ((select auth.uid()) = user_id);

drop policy if exists factions_player_select on public.factions;
drop policy if exists factions_member_select on public.factions;

drop policy if exists faction_deities_player_select on public.faction_deities;
create policy faction_deities_player_select on public.faction_deities
  for select
  using (
    private.is_campaign_member(campaign_id)
    and (
      private.faction_is_visible_to_caller(faction_id)
      or exists (
        select 1
          from deities d
         where d.id = faction_deities.deity_id
           and d.player_visible_to is not null
           and exists (
             select 1 from campaign_members cm
              where cm.user_id = (select auth.uid())
                and cm.role = 'player'
                and cm.party_member_id = any (d.player_visible_to)
           )
      )
    )
  );

-- ── 4. Live updates ─────────────────────────────────────────────────────────

drop trigger if exists notes_signal_insert on public.notes;
create trigger notes_signal_insert after insert on public.notes
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change('notes_player');

drop trigger if exists notes_signal_update on public.notes;
create trigger notes_signal_update after update on public.notes
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change('notes_player');

drop trigger if exists factions_signal_insert on public.factions;
create trigger factions_signal_insert after insert on public.factions
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change('factions_player');

drop trigger if exists factions_signal_update on public.factions;
create trigger factions_signal_update after update on public.factions
  referencing new table as changed
  for each statement execute procedure public.signal_campaign_change('factions_player');
