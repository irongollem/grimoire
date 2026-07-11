-- Migration: player_visible_items_projection
-- #507 (part 7 — item dm_notes).
--
-- Players read items two ways, both via the client's `select *` (useItems):
--   * items_party_inventory_member_select — any item in a party_inventory row of
--     a campaign they belong to (their vault),
--   * items_campaign_member_select — store items in a shared, player-visible,
--     inventory-shared location.
-- Both return the WHOLE items row, including `dm_notes` (a Tiptap-JSON "DM
-- secrets" block — plot hooks, who really wants the item, etc.) that the item UI
-- only ever renders behind `!playerView`. A player can read it from the JSON
-- payload in devtools. Fix: a SECURITY DEFINER projection that nulls `dm_notes`,
-- replacing both player policies so the base table isn't a devtools bypass.
--
-- NOTE (deliberately out of scope): the identified/unidentified/curse-revealed
-- split (mundane_* vs real description/image_url, curse_description) is gated
-- per party_inventory row (is_identified / curse_revealed), not per item, and the
-- client swaps them from the inv row — so it cannot be resolved in a per-item
-- projection and is left untouched here (curse_description is shown to players
-- once inv.curse_revealed). Only `dm_notes`, which has no per-row reveal and is
-- never player-facing, is nulled.

-- ── 1. Projection function ────────────────────────────────────────────────────
-- Column list matches the `items` row type positionally; dm_notes → null.
create or replace function get_player_visible_items()
returns setof items
language sql stable security definer
set search_path = public
as $$
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
    i.description,
    i.source,
    i.tags,
    i.image_url,
    i.created_at,
    i.updated_at,
    i.image_focal_point,
    i.weapon_range,
    i.versatile_damage,
    i.source_title,
    i.source_url,
    i.curse_description,
    i.is_arcane_focus,
    i.mundane_description,
    i.mundane_image_url,
    i.mundane_image_focal_point,
    i.bundle_items,
    i.campaign_id,
    null::text                       -- dm_notes (DM-only)
  from items i
  where
    -- their vault: any item in a party_inventory of a campaign they belong to
    exists (
      select 1
      from party_inventory pi
      join campaign_members cm on cm.campaign_id = pi.campaign_id
      where pi.item_id = i.id
        and cm.user_id = (select auth.uid())
    )
    -- or a shared, player-visible, inventory-shared store item
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

revoke all on function get_player_visible_items() from public;
revoke execute on function get_player_visible_items() from anon;
grant execute on function get_player_visible_items() to authenticated;

-- ── 2. Close the base-table devtools bypass ───────────────────────────────────
-- Players now read items only through the projection; drop both player policies.
-- The DM keeps full access via "items_select" (owner).
drop policy if exists "items_party_inventory_member_select" on items;
drop policy if exists "items_campaign_member_select" on items;
