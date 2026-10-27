-- #1113: party_inventory.is_ruined goes, one release after quality replaced it (#1102).
--
-- 20261025230846_item_quality kept the column for one release as a trigger-written mirror of
-- quality = 'ruined', because tabs still running the bundle from before it inserted
-- `is_ruined: false` from about fifteen inventory paths and would have failed on an unknown
-- column until reloaded. Nothing in the app reads or writes it now; useCampaignBackup still
-- translates an old backup file's is_ruined into quality, which reads a file, not the column.
--
-- give_inventory_item (#1112) copied the column onto the row it splits off a stack, so it is
-- redefined here without it: plpgsql would otherwise fail the first split after the drop.

drop trigger party_inventory_is_ruined_mirror on public.party_inventory;
drop function private.party_inventory_is_ruined_mirror();
alter table public.party_inventory drop column is_ruined;

create or replace function public.give_inventory_item(
  p_item_id uuid,
  p_to_member_id uuid,
  p_quantity integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.party_inventory%rowtype;
  v_to_campaign uuid;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Authorized before anything is locked, so a caller cannot hold a lock on a row they
  -- have no business with; then locked and judged again, since it may have moved since.
  select * into v_row from public.party_inventory where id = p_item_id;
  if not found or not private.can_write_pack(v_row.campaign_id, v_row.carried_by) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into v_row from public.party_inventory where id = p_item_id for update;
  if not found or not private.can_write_pack(v_row.campaign_id, v_row.carried_by) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  if p_to_member_id is not null then
    select pm.campaign_id into v_to_campaign from public.party_members pm where pm.id = p_to_member_id;
    if v_to_campaign is distinct from v_row.campaign_id then
      raise exception 'That character is not in this campaign' using errcode = '22023';
    end if;
  end if;

  if p_quantity is not null and (p_quantity < 1 or p_quantity > v_row.quantity) then
    raise exception 'Give between 1 and % of these', v_row.quantity using errcode = '22023';
  end if;

  if v_row.carried_by is not distinct from p_to_member_id then
    return v_row.id;
  end if;

  -- Part of a stack: the rest stays put, a new row carries the given part.
  if p_quantity is not null and p_quantity < v_row.quantity then
    if v_row.is_container then
      raise exception 'A container is given whole' using errcode = '22023';
    end if;
    update public.party_inventory set quantity = quantity - p_quantity where id = v_row.id;
    insert into public.party_inventory (
      campaign_id, user_id, item_id, library_item_id, name, quantity, carried_by,
      location, notes, current_charges, is_identified, curse_revealed, quality
    ) values (
      v_row.campaign_id, v_uid, v_row.item_id, v_row.library_item_id, v_row.name, p_quantity, p_to_member_id,
      'backpack', v_row.notes, v_row.current_charges, v_row.is_identified, v_row.curse_revealed, v_row.quality
    )
    returning id into v_new_id;
    return v_new_id;
  end if;

  update public.party_inventory
     set carried_by = p_to_member_id,
         location = 'backpack',
         container_id = null,
         slot = null,
         is_equipped = false,
         is_attuned = false
   where id = v_row.id;

  -- Only what is in the container AND in the same pack goes with it: a row someone else
  -- carries (pointed into this bag by its own carrier) stays theirs.
  if v_row.is_container then
    with recursive inside as (
      select pi.id from public.party_inventory pi
       where pi.container_id = v_row.id and pi.carried_by is not distinct from v_row.carried_by
      union
      select pi.id from public.party_inventory pi join inside on pi.container_id = inside.id
       where pi.carried_by is not distinct from v_row.carried_by
    )
    update public.party_inventory
       set carried_by = p_to_member_id,
           slot = null,
           is_equipped = false,
           is_attuned = false
     where id in (select id from inside);
  end if;

  return v_row.id;
end;
$$;
