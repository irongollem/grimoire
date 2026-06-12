-- Migration: player_visibility_locations_and_npc_projection
-- Two player-data-exposure fixes found in the codebase-wide audit.
--
-- 1. locations: the "Campaign members can read campaign locations" SELECT policy
--    used a bare `is_campaign_member(campaign_id)` with NO player_visible_to
--    gate. Because RLS policies are OR'd, it overrode the properly-gated
--    `locations_shared_map_*` policy and let any campaign PLAYER read every
--    location in the campaign — secret dungeons, DM notes, unshared maps. The
--    app's useSharedLocations relies on RLS to enforce player_visible_to.
--    Fix: replace it with a player_visible_to-gated policy mirroring npcs.
--    (DMs keep full access via the existing "Users can read own locations".)
--
-- 2. npcs: the row gate (npcs_player_select) is correct, but the player read
--    path does `select *`, so the FULL row ships — including DM-secret columns
--    (backstory, personality, notes, stat_block, alignment, …) the player UI
--    never displays, and critically the REAL identity of a disguised NPC
--    (name/portrait_url) even when is_revealed = false. A player could read the
--    raw JSON in devtools to unmask a hidden NPC. Fix: a SECURITY DEFINER
--    projection function that the player composables call instead of `select *`.
--    It swaps the disguise identity into name/portrait (so even consumers that
--    don't use the client display helper never see the real one), nulls the
--    DM-only narrative/mechanical columns, and honours player_visible_fields.

-- ── 1. locations player-visibility policy ─────────────────────────────────────

drop policy if exists "Campaign members can read campaign locations" on locations;

create policy locations_player_select on locations
  for select using (
    campaign_id is not null
    and exists (
      select 1 from campaign_members cm
      where cm.user_id = (select auth.uid())
        and cm.campaign_id = locations.campaign_id
        and cm.party_member_id = any (locations.player_visible_to)
    )
  );

-- ── 2. npcs projection function ───────────────────────────────────────────────
-- Returns player-visible NPCs with DM secrets stripped and disguised NPCs shown
-- under their cover identity. Mirrors the row gate of npcs_player_select.
-- p_campaign_id  → player NPC roster (useSharedNpcs)
-- p_location_ids → player atlas NPCs at given locations (useSharedNpcsByLocations)

create or replace function get_player_visible_npcs(
  p_campaign_id uuid default null,
  p_location_ids uuid[] default null
)
returns setof npcs
language sql stable security definer
set search_path = public
as $$
  select
    s.id,
    s.user_id,
    -- name: hidden if not whitelisted; disguise name if concealed; else real
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
    -- portrait: hidden if not whitelisted; disguise portrait if concealed; else real
    case
      when not ('portrait' = any (s.player_visible_fields)) then null
      when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_url
      else s.portrait_url
    end,
    s.tags,
    null::jsonb,                                           -- stat_block (DM-only)
    null::uuid,                                            -- scriptorium_doc_id (DM-only)
    s.created_at,
    s.updated_at,
    s.campaign_id,
    s.location_id,
    s.player_visible_fields,
    case
      when not ('portrait' = any (s.player_visible_fields)) then null
      when s.concealed and s.disguise_portrait_url is not null then s.disguise_portrait_focal_point
      else s.portrait_focal_point
    end,
    null::uuid,                                            -- linked_monster_id (DM-only)
    s.relevance,
    s.player_visible_to,
    null::text,                                            -- disguise_name (stripped)
    null::text,                                            -- disguise_portrait_url (stripped)
    null::jsonb,                                           -- disguise_portrait_focal_point (stripped)
    false                                                  -- is_revealed (cover shown; never leak true state)
  from (
    select n.*,
      ((n.disguise_name is not null or n.disguise_portrait_url is not null)
        and not n.is_revealed) as concealed
    from npcs n
    where (p_campaign_id is null or n.campaign_id = p_campaign_id)
      and (p_location_ids is null or n.location_id = any (p_location_ids))
      and exists (
        select 1 from campaign_members cm
        where cm.user_id = (select auth.uid())
          and cm.campaign_id = n.campaign_id
          and cm.party_member_id = any (n.player_visible_to)
      )
  ) s;
$$;

revoke all on function get_player_visible_npcs(uuid, uuid[]) from public;
grant execute on function get_player_visible_npcs(uuid, uuid[]) to authenticated;
