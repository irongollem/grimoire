-- Migration: player_unidentified_item_gating
-- #537 (split from #507 part 7). A player holding an UNIDENTIFIED magic item
-- still received the item's real `description` / `image_url` / `image_focal_point`
-- and its `curse_description` in the payload (readable in devtools before
-- identifying it). Identification state is per `party_inventory` row
-- (`is_identified`, `curse_revealed`), not per item, so the per-item
-- `get_player_visible_items` projection couldn't gate it — the client only hid
-- the fields in the UI via the inv row's flags.
--
-- Two parts:
--  (1) READ: gate the real presentation + curse in the projection using the
--      player's OWN identification state for that item. Conservative — hidden
--      unless EVERY vault copy is identified (mixed copies err safe: over-hide,
--      never under-hide). Store items are shown as their identified selves, but
--      `curse_description` is hidden for everything except a vault item whose
--      curse the DM has revealed to this player.
--  (2) WRITE: `party_inventory_member_update` lets any member flip any row's
--      flags, so a player could self-identify (defeating the read-gate). A
--      BEFORE UPDATE trigger blocks a non-DM from turning `is_identified` or
--      `curse_revealed` on — identifying items / revealing curses is a DM action
--      (matches the `canIdentify`-gated UI). Movement/equip/attune/charges/notes
--      updates are untouched; INSERTs (claim flows) don't fire it.

-- ── 1. READ gate ──────────────────────────────────────────────────────────────
create or replace function get_player_visible_items()
returns setof items
language sql stable security definer
set search_path = public
as $$
  with vault as (
    -- this player's identification state per item (all copies, conservatively)
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
    -- description: hidden for an unidentified vault item (client shows mundane_description)
    case when v.item_id is not null and not v.all_identified then null else i.description end,
    i.source,
    i.tags,
    -- image_url: hidden for an unidentified vault item (client falls back to mundane_image_url)
    case when v.item_id is not null and not v.all_identified then null else i.image_url end,
    i.created_at,
    i.updated_at,
    case when v.item_id is not null and not v.all_identified then null else i.image_focal_point end,
    i.weapon_range,
    i.versatile_damage,
    i.source_title,
    i.source_url,
    -- curse_description: only for a vault item whose curse the DM has revealed to this player
    case when v.item_id is not null and v.all_curse_revealed then i.curse_description else null end,
    i.is_arcane_focus,
    i.mundane_description,
    i.mundane_image_url,
    i.mundane_image_focal_point,
    i.bundle_items,
    i.campaign_id,
    null::text                       -- dm_notes (DM-only)
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

-- Grants/search_path are unchanged (create-or-replace preserves them), but
-- restate the anon revoke defensively.
revoke execute on function get_player_visible_items() from anon;

-- ── 2. WRITE integrity — only the DM identifies / reveals curses ───────────────
create or replace function guard_party_inventory_reveal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- The DM (campaign owner) may identify items and reveal curses.
  if private.is_campaign_dm(new.campaign_id) then
    return new;
  end if;
  -- A player may not turn identification / curse-reveal ON (self-identify).
  if (new.is_identified is distinct from old.is_identified)
     or (new.curse_revealed is distinct from old.curse_revealed) then
    raise exception 'Only the DM can identify items or reveal curses';
  end if;
  return new;
end;
$$;

-- Trigger functions bypass the EXECUTE check, so keep it off the RPC surface.
revoke execute on function guard_party_inventory_reveal() from public, anon, authenticated;

drop trigger if exists guard_party_inventory_reveal on party_inventory;
create trigger guard_party_inventory_reveal
  before update on party_inventory
  for each row execute procedure guard_party_inventory_reveal();
