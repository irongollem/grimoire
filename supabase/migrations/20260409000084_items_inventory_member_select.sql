-- Allow campaign members to read vault items that appear in the party inventory.
-- Without this, players see vaultItem=null for all inventory items (DM owns the items),
-- causing the identification system to show "Art Object" and no artwork for every item.
do $$ begin
  create policy "items_party_inventory_member_select" on items
    for select using (
      exists (
        select 1
          from party_inventory pi
          join campaign_members cm on cm.campaign_id = pi.campaign_id
         where pi.item_id = items.id
           and cm.user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;
