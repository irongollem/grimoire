-- Migration: npc_projection_gate_location_tags
-- #507 (part 6 — the NPC projection over-returns two fields).
--
-- get_player_visible_npcs (20260613000001) gates most columns on
-- player_visible_fields, but returns `location_id` and `tags` unconditionally:
--   * location_id — leaks WHERE a shared NPC is even when the DM did not enable
--     the "Location" toggle (NPC_PLAYER_FIELDS has a `location` key for exactly
--     this). PlayerLocationsView groups the atlas by location_id, so an NPC with
--     the toggle off should simply not be pinned to its location.
--   * tags — DM categorisation with NO player-facing toggle at all (not in
--     NPC_PLAYER_FIELDS) and never shown in a player view; DM-only.
--
-- Re-create the projection with those two gated. Everything else is byte-for-byte
-- the identical body from 20260613000001. The p_location_ids FILTER still uses the
-- raw n.location_id inside the subquery, so the player atlas keeps working; only
-- the OUTPUT location_id is gated.
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
    null::text[],                                          -- tags (DM-only; no player toggle)
    null::jsonb,                                           -- stat_block (DM-only)
    null::uuid,                                            -- scriptorium_doc_id (DM-only)
    s.created_at,
    s.updated_at,
    s.campaign_id,
    -- location_id: only when the DM enabled the "Location" toggle
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
