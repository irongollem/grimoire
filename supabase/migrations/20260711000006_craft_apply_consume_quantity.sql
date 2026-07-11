-- Migration: craft_apply_consume_quantity
-- Crafting consumed ingredients by deleting whole party_inventory rows
-- (`delete ... where id = any(p_ingredient_ids)` in craft_apply, migration
-- 20260613000002), ignoring the recipe's required quantity. A stack of 20 Iron
-- Ingots was destroyed to craft with 2. This replaces the whole-row delete with a
-- per-row quantity decrement: each ingredient row loses exactly the amount the
-- recipe consumes, and a row is deleted only when it reaches 0. The success/ruin
-- inserts and the single-transaction atomicity are unchanged.
--
-- Signature changes from `p_ingredient_ids uuid[]` to `p_ingredients jsonb`
-- (an array of {id, qty}); the old overload is dropped so the whole-stack-deleting
-- version can't be called. SECURITY INVOKER (default) — the caller's RLS still
-- gates every update/delete/insert and user_id is forced to auth.uid().

drop function if exists craft_apply(uuid[], text, jsonb, jsonb);

create or replace function craft_apply(
  p_ingredients  jsonb,                       -- [{ "id": uuid, "qty": int }, ...]
  p_outcome      text,
  p_success_rows jsonb default '[]'::jsonb,
  p_ruined_row   jsonb default null
)
returns void
language plpgsql
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ing record;
begin
  -- Consume each ingredient by its required quantity; delete the row only when
  -- the stack is fully used up.
  if p_ingredients is not null then
    for v_ing in
      select (x->>'id')::uuid as id, (x->>'qty')::int as qty
      from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) as x
    loop
      if v_ing.id is null or v_ing.qty is null or v_ing.qty <= 0 then
        continue;
      end if;
      update party_inventory
        set quantity = quantity - v_ing.qty
        where id = v_ing.id;
      delete from party_inventory
        where id = v_ing.id and quantity <= 0;
    end loop;
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

revoke all on function craft_apply(jsonb, text, jsonb, jsonb) from public;
grant execute on function craft_apply(jsonb, text, jsonb, jsonb) to authenticated;
