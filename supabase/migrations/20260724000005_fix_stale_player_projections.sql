-- Migration: fix_stale_player_projections
-- get_player_visible_monsters (20260711000011) and get_player_visible_items
-- (20260711000016) are `returns setof <table>` with hand-maintained positional
-- column lists. Migration 20260720000018 widened `monsters` (ruleset,
-- conceptual_key, source_document_key, source_record_key, source_revision,
-- source_license, provenance — and lair_location_id landed earlier) and
-- `items` (same versioning set), and 20260722000001 added items.mastery —
-- without recreating either function. Since then BOTH have failed at runtime
-- with `42P13 return type mismatch ... too few columns`, which silently broke
-- every real-player surface that resolves custom monsters (bestiary names,
-- wild-shape eligible forms) or vault items (player inventory detail).
-- DM preview was unaffected (it reads the base tables), which is why this
-- went unnoticed until players reported "Unknown creature".
--
-- Recreate both with the full current row. The paired pgTAP test
-- (supabase/tests/player_projections.test.sql) now executes every
-- setof-table function in CI, so the next table widening that forgets its
-- projections fails the spell-database job instead of production.

-- ── get_player_visible_monsters ───────────────────────────────────────────────
-- Logic identical to 20260711000011; only the column list is completed.
create or replace function get_player_visible_monsters(
  p_campaign_id uuid
)
returns setof monsters
language sql stable security definer
set search_path = public
as $$
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
    m.provenance
  from monsters m
  join visible v on v.monster_id = m.id
  where private.is_campaign_member(p_campaign_id);
$$;

revoke execute on function get_player_visible_monsters(uuid) from anon;

-- ── get_player_visible_items ──────────────────────────────────────────────────
-- Logic identical to 20260711000016 (unidentified/curse gating preserved);
-- only the column list is completed.
create or replace function get_player_visible_items()
returns setof items
language sql stable security definer
set search_path = public
as $$
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
    case when v.item_id is not null and not v.all_identified then null else i.description end,
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
    case when v.item_id is not null and v.all_curse_revealed then i.curse_description else null end,
    i.is_arcane_focus,
    i.mundane_description,
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
    i.mastery
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
$$;

revoke execute on function get_player_visible_items() from anon;
