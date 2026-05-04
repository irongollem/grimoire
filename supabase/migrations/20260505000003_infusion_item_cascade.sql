-- Migration: infusion_item_cascade
-- When a party_inventory item is deleted, automatically remove any active_infusions
-- entries on party_members that reference it by inv_item_id.

create or replace function clear_infusion_on_item_delete()
returns trigger as $$
begin
  update party_members
  set active_infusions = coalesce(
    (
      select jsonb_agg(inf)
      from jsonb_array_elements(coalesce(active_infusions, '[]'::jsonb)) as inf
      where inf->>'inv_item_id' != old.id::text
    ),
    '[]'::jsonb
  )
  where exists (
    select 1
    from jsonb_array_elements(coalesce(active_infusions, '[]'::jsonb)) as inf
    where inf->>'inv_item_id' = old.id::text
  );

  return old;
end;
$$ language plpgsql;

create trigger party_inventory_clear_infusion
  after delete on party_inventory
  for each row execute procedure clear_infusion_on_item_delete();
