-- get_player_visible_monsters returns `setof monsters` with an explicit,
-- positional column list, so every column added to `monsters` has to be added
-- here in the same position, or the function stops executing ("return type
-- mismatch"). 20260927065654 added `monsters.cutout_url` (#917) and missed
-- this; supabase/tests/player_projections.test.sql caught it in CI before
-- anything was released.
--
-- The cutout is the same creature art as image_url, which players already
-- see, so it is projected as is. Everything else is unchanged from
-- 20260925002215 (grants survive CREATE OR REPLACE).

CREATE OR REPLACE FUNCTION public.get_player_visible_monsters(p_campaign_id uuid)
 RETURNS SETOF monsters
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (
    select cm.party_member_id
    from campaign_members cm
    where cm.user_id = (select auth.uid())
      and cm.campaign_id = p_campaign_id
  ),
  discovered as (
    select dm.monster_id,
           bool_or(dm.reveal_stats) as reveal_stats
    from discovered_monsters dm
    where dm.campaign_id = p_campaign_id
      and dm.monster_id is not null
      and (
        dm.visible_to is null
        or exists (select 1 from me where me.party_member_id = any (dm.visible_to))
      )
    group by dm.monster_id
  ),
  pinned as (
    select pf.monster_id
    from pinned_forms pf
    where pf.campaign_id = p_campaign_id
      and pf.monster_id is not null
      and pf.party_member_id in (select party_member_id from me)
  ),
  visible as (
    select monster_id, bool_or(reveal_stats) as reveal_stats
    from (
      select monster_id, reveal_stats from discovered
      union all
      select monster_id, true as reveal_stats from pinned
    ) u
    group by monster_id
  )
  select
    m.id,
    m.user_id,
    m.name,
    m.monster_type,
    m.size,
    m.alignment,
    m.habitat,
    m.source,
    m.tags,
    case when v.reveal_stats then m.stat_block else null::jsonb end,  -- stat_block gated by reveal_stats
    null::text,                                                       -- notes (DM-only)
    m.created_at,
    m.updated_at,
    m.image_url,
    null::text,                                                       -- description (DM-only)
    m.portrait_focal_point,
    m.open5e_import,
    m.source_title,
    m.source_url,
    null::uuid,                                                       -- lair_location_id (DM-only)
    m.ruleset,
    m.conceptual_key,
    m.source_document_key,
    m.source_record_key,
    m.source_revision,
    m.source_license,
    m.provenance,
    m.ai_provenance,
    null::uuid,                                                       -- campaign_id (DM-only scope)
    null::text,                                                       -- demo_source (#912): a quota marker, nothing for players
    m.cutout_url                                                      -- cutout_url (#917): same art as image_url
  from monsters m
  join visible v on v.monster_id = m.id
  where private.is_campaign_member(p_campaign_id);
$function$

;
