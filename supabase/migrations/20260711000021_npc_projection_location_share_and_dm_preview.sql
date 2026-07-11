-- Migration: npc_projection_location_share_and_dm_preview
-- Two related fixes to the player NPC projection (#528):
--
-- 1. DM Preview showed zero NPCs. The row gate required
--    `cm.party_member_id = any(player_visible_to)`, but a DM's campaign_members
--    row has party_member_id = null, so useSharedNpcs returned [] in preview
--    (People section, atlas "People in the Area", location-dialog NPCs all empty).
--    Add a DM branch (new p_preview_member_id param) that projects exactly what
--    the previewed member would see.
--
-- 2. "Share linked NPCs" on a location did nothing unless each NPC was also
--    individually shared, contradicting worldbuilding-atlas.md:39 ("Players see
--    which NPCs are in this area"). An NPC is now also visible when its OWN
--    location (direct location_id match — NOT sublocations, so a hidden NPC in a
--    child location like an assassin upstairs stays hidden) has is_npcs_shared on
--    and is shared with the player. Field-level gating (player_visible_fields) is
--    unchanged, so a location-shared NPC whose fields the DM hasn't shared still
--    shows as a gated/unknown entry — flagged for further design thought.
--
-- The SELECT projection is byte-for-byte the prior version (20260711000015); only
-- the WHERE gate changes and the p_preview_member_id param is added. Arg count
-- changes, so drop the 2-arg version first, then re-apply the anon revoke.

drop function if exists public.get_player_visible_npcs(uuid, uuid[]);

create or replace function public.get_player_visible_npcs(
  p_campaign_id uuid default null,
  p_location_ids uuid[] default null,
  p_preview_member_id uuid default null
)
  returns setof npcs
  language sql
  stable
  security definer
  set search_path to 'public'
as $function$
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

-- Supabase grants anon a direct EXECUTE on new public functions by default.
revoke execute on function public.get_player_visible_npcs(uuid, uuid[], uuid) from public, anon;
grant execute on function public.get_player_visible_npcs(uuid, uuid[], uuid) to authenticated, service_role;
