-- Migration: player_visible_monsters_projection
-- #507 (part 2 — custom monsters, the biggest player-visibility leak after puzzles).
--
-- monsters_player_select (20260507000013) grants a campaign member the WHOLE
-- custom-monster row as soon as ANY discovered_monsters row exists in the
-- campaign — it ignores BOTH this player's `visible_to` and the discovery's
-- `reveal_stats` flag. So a player receives the full `stat_block`, DM
-- `description`, and DM `notes` of every custom monster discovered by anyone in
-- the campaign, and can read it straight out of the JSON payload in devtools
-- even for creatures whose stats the DM has NOT revealed and which were shared
-- with a different party member. The player bestiary sources monster rows via
-- the shared useAllMonsters (base `select *`), so RLS is the only gate.
--
-- Column/sub-row secrecy can't be expressed in an RLS policy, so the fix mirrors
-- the puzzles/NPC projections: a SECURITY DEFINER function that gates rows on
-- THIS player's visibility, nulls `stat_block` when `reveal_stats = false`, and
-- strips DM `description`/`notes`, PLUS dropping the player branch of
-- monsters_player_select so the base table is no longer a devtools bypass.
--
-- SRD monsters (srd_monsters) are public reference data and are unaffected — the
-- security-critical target is CUSTOM monsters (the `monsters` table). Pinned
-- wild-shape forms are surfaced with full stats: the DM chose to share them with
-- this player, and a druid needs the stat block to use the form.

-- ── 1. Projection function ────────────────────────────────────────────────────
-- Returns the custom monsters this player may see in a campaign:
--   * discovered for them (visible_to null = whole party, or contains their
--     party_member_id) — stat_block nulled unless the discovery reveal_stats,
--   * pinned as a wild-shape form for them — always full stats.
-- Column list matches the `monsters` row type positionally.
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
  -- Custom monsters discovered for this player, carrying the reveal flag.
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
  -- Custom monsters pinned as a wild-shape form for this player — full stats.
  pinned as (
    select pf.monster_id
    from pinned_forms pf
    where pf.campaign_id = p_campaign_id
      and pf.monster_id is not null
      and pf.party_member_id in (select party_member_id from me)
  ),
  -- Union both sources; a pinned monster is always revealed.
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
    m.source_url
  from monsters m
  join visible v on v.monster_id = m.id
  where private.is_campaign_member(p_campaign_id);
$$;

revoke all on function get_player_visible_monsters(uuid) from public;
-- Supabase's default privileges grant `anon` a direct EXECUTE on new public
-- functions, so `revoke ... from public` alone leaves anon executable (flagged
-- by the security advisor). Revoke it explicitly, then grant only authenticated.
revoke execute on function get_player_visible_monsters(uuid) from anon;
grant execute on function get_player_visible_monsters(uuid) to authenticated;

-- ── 2. Close the base-table devtools bypass ───────────────────────────────────
-- Players now read custom monsters only through the projection, so restrict the
-- base-table SELECT to the owner (DM). The DM keeps full access via this branch;
-- the "monsters: owner full access" policy is unchanged.
drop policy if exists "monsters_player_select" on monsters;

create policy "monsters_player_select" on monsters for select using (
  (select auth.uid()) = user_id
);
