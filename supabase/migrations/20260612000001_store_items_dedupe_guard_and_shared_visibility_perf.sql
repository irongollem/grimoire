-- Migration: store_items_dedupe_guard_and_shared_visibility_perf
-- 1. Dedupe store_items (defensive — prod already cleaned) and add a unique
--    constraint on (location_id, item_id) so a store can never hold the same
--    item twice, no matter how often quick-fill is clicked against a stale view.
-- 2. Replace the nested-RLS player-visibility policies on store_items and items
--    with security-definer helpers. The old policies referenced other
--    RLS-protected tables (store_items -> locations, items -> store_items ->
--    locations), so Postgres stacked every referenced table's policies into the
--    plan (~37 subplans, ~75ms planning per request; per-row execution for
--    players). The helpers flatten that to one indexed EXISTS each.

-- ── 1. Dedupe + unique guard ──────────────────────────────────────────────────

delete from store_items si
using store_items keep
where keep.location_id = si.location_id
  and keep.item_id = si.item_id
  and (keep.created_at < si.created_at
    or (keep.created_at = si.created_at and keep.id < si.id));

alter table store_items
  add constraint store_items_location_item_unique unique (location_id, item_id);

-- ── 2. Security-definer visibility helpers ────────────────────────────────────

-- Can the current user (as a campaign player) see the shared inventory of this
-- location? Security definer: skips RLS on locations/campaign_members so the
-- policy plan stays flat.
create or replace function can_see_shared_store(loc_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from locations l
    join campaign_members cm on cm.campaign_id = l.campaign_id
    where l.id = loc_id
      and cm.user_id = (select auth.uid())
      and cm.party_member_id = any (l.player_visible_to)
      and l.is_inventory_shared = true
  );
$$;

-- Is this item listed (visible) in any shared store the current user can see?
create or replace function item_in_visible_shared_store(item_uuid uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from store_items si
    join locations l on l.id = si.location_id
    join campaign_members cm on cm.campaign_id = l.campaign_id
    where si.item_id = item_uuid
      and si.visible = true
      and l.is_inventory_shared = true
      and cm.user_id = (select auth.uid())
      and cm.party_member_id = any (l.player_visible_to)
  );
$$;

drop policy if exists store_items_campaign_member_select on store_items;
create policy store_items_campaign_member_select on store_items
  for select using (visible = true and can_see_shared_store(location_id));

drop policy if exists items_campaign_member_select on items;
create policy items_campaign_member_select on items
  for select using (item_in_visible_shared_store(id));
