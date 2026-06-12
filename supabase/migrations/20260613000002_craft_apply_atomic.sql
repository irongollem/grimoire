-- Migration: craft_apply_atomic
-- Crafting consumed ingredients with one DELETE and then inserted the output/
-- ruined item with a separate INSERT (useCrafting attemptCraft). A failure
-- between the two (network blip, constraint) permanently destroyed the
-- ingredients with nothing created. This function performs both in a single
-- transaction (a plpgsql function body is atomic) so ingredients are never lost
-- without their result. SECURITY INVOKER (default): the caller's RLS still
-- applies to every delete/insert, and user_id is forced to auth.uid().

create or replace function craft_apply(
  p_ingredient_ids uuid[],
  p_outcome text,
  p_success_rows jsonb default '[]'::jsonb,
  p_ruined_row jsonb default null
)
returns void
language plpgsql
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if p_ingredient_ids is not null and array_length(p_ingredient_ids, 1) is not null then
    delete from party_inventory where id = any (p_ingredient_ids);
  end if;

  if p_outcome = 'success' then
    insert into party_inventory
      (campaign_id, user_id, item_id, name, quantity, carried_by, location, is_ruined)
    select
      x.campaign_id, v_uid, x.item_id, x.name, x.quantity, x.carried_by, 'backpack', false
    from jsonb_to_recordset(coalesce(p_success_rows, '[]'::jsonb))
      as x(campaign_id uuid, item_id uuid, name text, quantity integer, carried_by uuid);

  elsif p_outcome = 'ruin' and p_ruined_row is not null then
    insert into party_inventory
      (campaign_id, user_id, item_id, name, quantity, carried_by, location, notes, is_ruined)
    values (
      (p_ruined_row->>'campaign_id')::uuid, v_uid,
      nullif(p_ruined_row->>'item_id', '')::uuid,
      p_ruined_row->>'name', 1,
      nullif(p_ruined_row->>'carried_by', '')::uuid,
      'backpack', 'Ruined during a failed crafting attempt.', true
    );
  end if;
end;
$$;

revoke all on function craft_apply(uuid[], text, jsonb, jsonb) from public;
grant execute on function craft_apply(uuid[], text, jsonb, jsonb) to authenticated;
