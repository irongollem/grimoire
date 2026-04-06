-- Allow campaign members to read items that appear as visible wares
-- in a shared location within their campaign.
-- Fixes: players see the "Wares" label but no items (items table had no
--        campaign-member RLS policy, so the items(*) join returned nothing).
do $$ begin
  create policy "items_campaign_member_select" on items
    for select using (
      exists (
        select 1
          from store_items si
          join locations l on l.id = si.location_id
          join campaign_members cm on cm.campaign_id = l.campaign_id
         where si.item_id = items.id
           and cm.user_id = auth.uid()
           and (l.shared_with_players = true or l.player_visible_to is not null)
           and l.is_inventory_shared = true
           and si.visible = true
      )
    );
exception when duplicate_object then null;
end $$;
