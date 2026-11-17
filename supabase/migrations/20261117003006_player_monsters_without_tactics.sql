-- A monster's "how it fights" stays with the DM (#1203).
--
-- `stat_block.tactics` holds the DM's own choices for a creature the app may run (role, who it goes for, morale, cover)
-- and one line in their own words ("guards the door and never leaves it", "will turn on the party"). The player
-- projection hands the whole stat block to a player once the DM reveals its stats, or when the monster is a pinned
-- Wild Shape form, so that key went with it. It is not a statistic and a player has no use for it: strip it here,
-- at the one place a player reads a campaign monster. NPC stat blocks are already null for players.
--
-- The body is the applied definition (20260927080501) with `- 'tactics'` on the stat block and nothing else changed.
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
    case when v.reveal_stats then m.stat_block - 'tactics' else null::jsonb end,  -- stat_block gated by reveal_stats, never the DM's tactics
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
