-- Migration: item_quality
-- Item quality as a trait of inventory rows (#1102). The maintainer's decisions, 26 Oct 2026:
--   * Five steps: ruined / poor (-2) / standard (0) / fine (+1) / masterwork (+2).
--   * Ruined is the bottom step and REPLACES party_inventory.is_ruined. One column says what
--     condition a row is in; a boolean beside it would be a second answer to the same question.
--     A ruined row can never be spent on a craft, exactly as is_ruined.
--   * A failed craft degrades only the primary ingredient, one step (the critical failure still
--     ruins it). A high roll (beating the DC by 10 or more) makes the output fine. Masterwork is
--     never crafted by a roll; it comes from the DM or loot.
--   * The workbench's "Poor ingredients" checkbox goes: the quality of the stacks spent replaces it.
-- Quality is per ROW, not per item: two stacks of the same item can differ, so degrading part of
-- a stack splits it into two rows.

alter table public.party_inventory
  add column quality text not null default 'standard'
    constraint party_inventory_quality_values
    check (quality in ('ruined', 'poor', 'standard', 'fine', 'masterwork'));

comment on column public.party_inventory.quality is
  'The row''s condition (#1102): ruined, poor, standard, fine or masterwork. Feeds the crafting roll (poor -2, fine +1, masterwork +2); ruined rows cannot be spent. Replaced the is_ruined boolean.';

-- Carry the old flag across. The crit-fail wreckage used to say so in its name as well; the
-- quality marker says it now, so the prefix would only repeat it.
update public.party_inventory
   set quality = 'ruined',
       name = regexp_replace(name, '^Ruined: ', '')
 where is_ruined;

-- One step down, ruined staying ruined. Pure; in `private` so PostgREST does not publish it.
create function private.quality_step_down(p_quality text)
returns text
language sql
immutable
set search_path to ''
as $$
  select case p_quality
    when 'masterwork' then 'fine'
    when 'fine' then 'standard'
    when 'standard' then 'poor'
    else 'ruined'
  end;
$$;

revoke execute on function private.quality_step_down(text) from public, anon, authenticated;
-- craft_apply is SECURITY INVOKER, so the player's own role calls this.
grant execute on function private.quality_step_down(text) to authenticated;

-- ── The bench guard reads quality ───────────────────────────────────────────

create or replace function private.craft_bench_guard(p_party_member_id uuid, p_row_ids uuid[], p_allow_empty boolean)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := (select auth.uid());
  v_campaign uuid;
  v_distinct int;
begin
  -- Identity from auth.uid() only: the caller must be the player seated as this character, and
  -- its owner rather than a caretaker minding it (private.plays_for_another, #1059).
  select pm.campaign_id into v_campaign from party_members pm where pm.id = p_party_member_id;
  if v_uid is null or v_campaign is null or not exists (
    select 1 from campaign_members cm
    where cm.user_id = v_uid
      and cm.campaign_id = v_campaign
      and cm.party_member_id = p_party_member_id
  ) or private.plays_for_another(p_party_member_id) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- A NULL element is refused outright: cardinality() counts it but every row check below
  -- ignores it, so `array[null]` would otherwise reach the matching with nothing laid out and
  -- probe for secret single-ingredient recipes (audit, 24 Oct 2026).
  if p_row_ids is null or cardinality(p_row_ids) > 8
     or (cardinality(p_row_ids) = 0 and not p_allow_empty)
     or array_position(p_row_ids, null) is not null then
    raise exception 'Lay out between one and eight items' using errcode = '22023';
  end if;

  v_distinct := (select count(distinct x) from unnest(p_row_ids) as x);

  -- Every laid-out row must be this character's or the party stash's, in this campaign, and
  -- spendable (never ruined, equipped, a container or an empty stack), filling no more dishes
  -- than it holds units. Its own code, apart from the caller's 42501.
  if v_distinct <> (
    select count(*)
    from (select x as id, count(*)::int as dishes from unnest(p_row_ids) as x group by x) d
    join party_inventory pi on pi.id = d.id
    where pi.campaign_id = v_campaign
      and (pi.carried_by = p_party_member_id or pi.carried_by is null)
      and pi.quality <> 'ruined' and not pi.is_equipped and not pi.is_container
      and pi.quantity >= d.dishes
  ) then
    raise exception 'Those items cannot be laid out' using errcode = 'CX001';
  end if;

  return v_campaign;
end;
$$;

-- ── The craft writes quality ────────────────────────────────────────────────
-- A new argument, so the old signature goes (no overload left behind for a stale client).
--   success: the outputs, `quality` 'fine' when the roll beat the DC by 10 or more, else
--            standard (a craft never makes masterwork); every ingredient spent.
--   fail:    p_degrade = {id, qty}: those units of the primary drop one step. Nothing is spent.
--            The whole stack changes when it is all the recipe uses; otherwise the units split
--            off into a row of their own.
--   ruin:    the primary is spent (p_ingredients) and comes back as one ruined row.

drop function public.craft_apply(jsonb, text, jsonb, jsonb);

create function public.craft_apply(
  p_ingredients jsonb,
  p_outcome text,
  p_success_rows jsonb default '[]'::jsonb,
  p_ruined_row jsonb default null,
  p_degrade jsonb default null)
returns void
language plpgsql
set search_path to 'public'
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ing record;
  v_row party_inventory%rowtype;
  v_id uuid;
  v_qty int;
  v_next text;
begin
  if p_outcome = 'success' then
    insert into party_inventory
      (campaign_id, user_id, item_id, library_item_id, name, quantity, carried_by, location, quality)
    select
      x.campaign_id, v_uid, x.item_id, x.library_item_id, x.name, x.quantity, x.carried_by, 'backpack',
      case when x.quality = 'fine' then 'fine' else 'standard' end
    from jsonb_to_recordset(coalesce(p_success_rows, '[]'::jsonb))
      as x(campaign_id uuid, item_id uuid, library_item_id text, name text, quantity integer, carried_by uuid, quality text);

  elsif p_outcome = 'ruin' and p_ruined_row is not null then
    insert into party_inventory
      (campaign_id, user_id, item_id, library_item_id, name, quantity, carried_by, location, notes, quality)
    values (
      (p_ruined_row->>'campaign_id')::uuid, v_uid,
      nullif(p_ruined_row->>'item_id', '')::uuid,
      nullif(p_ruined_row->>'library_item_id', ''),
      p_ruined_row->>'name', 1,
      nullif(p_ruined_row->>'carried_by', '')::uuid,
      'backpack', 'Ruined during a failed crafting attempt.', 'ruined'
    );

  elsif p_outcome = 'fail' then
    v_id := nullif(p_degrade->>'id', '')::uuid;
    v_qty := (p_degrade->>'qty')::int;
    if v_id is null or v_qty is null or v_qty <= 0 then
      raise exception 'A failed craft names the primary ingredient it degrades' using errcode = '22023';
    end if;
    -- Under the caller's RLS: a row they cannot see is not found.
    select * into v_row from party_inventory where id = v_id for update;
    if not found then
      raise exception 'That ingredient is not in your inventory' using errcode = 'P0002';
    end if;
    v_next := private.quality_step_down(v_row.quality);
    if v_row.quantity <= v_qty then
      update party_inventory set quality = v_next where id = v_id;
    else
      update party_inventory set quantity = quantity - v_qty where id = v_id;
      insert into party_inventory
      select * from jsonb_populate_record(null::party_inventory,
        to_jsonb(v_row) || jsonb_build_object(
          -- The split row is the caller's insert, like every other row craft_apply writes: a
          -- stash row belongs to whoever added it (often the DM), and copying that user_id would
          -- fail the player's own insert policy.
          'id', gen_random_uuid(), 'user_id', v_uid, 'quantity', v_qty, 'quality', v_next,
          'is_equipped', false, 'slot', null, 'is_attuned', false));
    end if;
  end if;

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
end;
$$;

revoke execute on function public.craft_apply(jsonb, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.craft_apply(jsonb, text, jsonb, jsonb, jsonb) to authenticated, service_role;

-- ── Drops carry quality ─────────────────────────────────────────────────────
-- An item drop may name its quality (the DM's send menu); none means standard. A grab merges
-- only into a stack of the same quality, so fine loot never vanishes into a standard stack.

create or replace function public.grab_item_drop(p_message_id uuid, p_qty integer, p_claimer_user_id uuid, p_claimer_name text, p_party_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_meta jsonb;
  v_campaign_id uuid;
  v_qty_orig int;
  v_qty_rem int;
  v_to_grab int;
  v_new_claim jsonb;
  v_new_meta jsonb;
  v_item_id uuid;
  v_library_item_id text;
  v_identified boolean;
  v_container boolean;
  v_quality text;
  v_existing uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- Retained because deployed clients still send it. It is deliberately ignored:
  -- the authenticated JWT remains the only source of claimant identity.
  perform p_claimer_user_id;

  select metadata, campaign_id into v_meta, v_campaign_id
  from public.campaign_messages
  where id = p_message_id and type = 'item_drop'
  for update;

  if v_meta is null then raise exception 'message not found'; end if;
  if not private.is_campaign_member(v_campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  if p_party_member_id is not null then
    if not exists (
      select 1 from public.party_members pm
      where pm.id = p_party_member_id
        and pm.campaign_id = v_campaign_id
        and (
          pm.owner_user_id = auth.uid()
          or exists (
            select 1 from public.campaign_members cm
            where cm.campaign_id = v_campaign_id
              and cm.user_id = auth.uid()
              and cm.party_member_id = p_party_member_id
          )
        )
    ) then
      raise exception 'Cannot grab an item to a member you do not control';
    end if;
  end if;

  v_qty_orig := coalesce((v_meta->>'quantity')::int, 1);
  v_qty_rem := coalesce((v_meta->>'quantity_remaining')::int, v_qty_orig);

  if v_qty_rem <= 0 then raise exception 'stack exhausted'; end if;

  if p_qty < 0 or p_qty >= v_qty_rem then
    v_to_grab := v_qty_rem;
  else
    v_to_grab := p_qty;
  end if;

  v_new_claim := jsonb_build_object(
    'user_id', auth.uid(),
    'name', p_claimer_name,
    'party_member_id', p_party_member_id,
    'qty', v_to_grab,
    'at', to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );

  v_new_meta := v_meta
    || jsonb_build_object('quantity_remaining', v_qty_rem - v_to_grab)
    || jsonb_build_object(
      'claims', coalesce(v_meta->'claims', '[]'::jsonb) || jsonb_build_array(v_new_claim)
    );

  update public.campaign_messages set metadata = v_new_meta where id = p_message_id;

  v_item_id := nullif(v_meta->>'item_id', '')::uuid;
  v_library_item_id := nullif(v_meta->>'library_item_id', '');
  v_identified := coalesce((v_meta->>'item_rarity') = 'mundane', false);
  v_container := coalesce((v_meta->>'is_container')::boolean, false);
  -- An unknown word reads as standard rather than failing the grab; the check constraint
  -- would refuse anything else anyway.
  v_quality := case when v_meta->>'quality' in ('ruined', 'poor', 'standard', 'fine', 'masterwork')
                    then v_meta->>'quality' else 'standard' end;

  if v_item_id is not null or v_library_item_id is not null then
    select id into v_existing from public.party_inventory
    where campaign_id = v_campaign_id
      and item_id is not distinct from v_item_id
      and library_item_id is not distinct from v_library_item_id
      and carried_by is not distinct from p_party_member_id
      and container_id is null
      and location in ('backpack', 'belt')
      and quality = v_quality
      and not is_equipped
      and is_identified = v_identified
      and is_container = v_container
    limit 1;
  end if;

  if v_existing is not null then
    update public.party_inventory
    set quantity = quantity + v_to_grab
    where id = v_existing;
  else
    insert into public.party_inventory
      (campaign_id, user_id, item_id, library_item_id, name, quantity, carried_by, location,
       is_container, is_identified, quality)
    values (
      v_campaign_id, auth.uid(), v_item_id, v_library_item_id,
      v_meta->>'item_name', v_to_grab, p_party_member_id, 'backpack',
      v_container, v_identified, v_quality
    );
  end if;

  return jsonb_build_object(
    'qty_grabbed', v_to_grab,
    'quantity_remaining', v_qty_rem - v_to_grab
  );
end;
$$;

-- A claimed drop keeps the quality of the row that was dropped.
create or replace function public.claim_item_drop(p_message_id uuid, p_claimer_name text, p_party_member_id uuid, p_npc_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_msg  public.campaign_messages;
  v_meta jsonb;
begin
  select * into v_msg from public.campaign_messages
  where id = p_message_id and type = 'item_drop'
  for update;

  if v_msg is null then raise exception 'Drop not found'; end if;
  if not private.is_campaign_member(v_msg.campaign_id) then
    raise exception 'Not a campaign member';
  end if;

  v_meta := coalesce(v_msg.metadata, '{}'::jsonb);
  if v_meta->>'claimed_by_user_id' is not null then
    raise exception 'Already claimed';
  end if;

  v_meta := v_meta || jsonb_build_object(
    'claimed_by_user_id',      auth.uid()::text,
    'claimed_by_name',         p_claimer_name,
    'claimed_party_member_id', p_party_member_id,
    'npc_id',                  p_npc_id
  );
  update public.campaign_messages set metadata = v_meta where id = p_message_id;

  if p_npc_id is not null then
    -- Giving a drop to an NPC is the DM's move: NPC inventory is the DM's to
    -- write (npc_inventory_insert), and a player who could do it here could
    -- also take a drop away from the party (found in #964's pre-push audit).
    if not private.is_campaign_dm(v_msg.campaign_id) then
      raise exception 'Only the DM can give a drop to an NPC';
    end if;
    insert into public.npc_inventory (campaign_id, user_id, npc_id, item_id, library_item_id, name, quantity, notes)
    values (
      v_msg.campaign_id, auth.uid(), p_npc_id,
      nullif(v_meta->>'item_id', '')::uuid,
      nullif(v_meta->>'library_item_id', ''),
      v_meta->>'item_name',
      coalesce((v_meta->>'quantity')::int, 1),
      null
    );
  else
    -- Only deliver to the caller's OWN character (owned or linked); a null member
    -- is a stash claim (any campaign member may stash).
    if p_party_member_id is not null then
      if not exists (
        select 1 from public.party_members pm
        where pm.id = p_party_member_id
          and pm.campaign_id = v_msg.campaign_id
          and (
            pm.owner_user_id = auth.uid()
            or exists (
              select 1 from public.campaign_members cm
              where cm.campaign_id = v_msg.campaign_id
                and cm.user_id = auth.uid()
                and cm.party_member_id = p_party_member_id
            )
          )
      ) then
        raise exception 'Cannot claim an item to a member you do not control';
      end if;
    end if;

    insert into public.party_inventory
      (campaign_id, user_id, item_id, library_item_id, name, quantity, carried_by, location,
       is_container, is_identified, quality)
    values (
      v_msg.campaign_id, auth.uid(),
      nullif(v_meta->>'item_id', '')::uuid,
      nullif(v_meta->>'library_item_id', ''),
      v_meta->>'item_name',
      coalesce((v_meta->>'quantity')::int, 1),
      p_party_member_id, 'backpack',
      coalesce((v_meta->>'is_container')::boolean, false),
      coalesce((v_meta->>'item_rarity') = 'mundane', false),
      -- The dropped row's quality travels with it (#1102); none, or an unknown word, is standard.
      case when v_meta->>'quality' in ('ruined', 'poor', 'standard', 'fine', 'masterwork')
           then v_meta->>'quality' else 'standard' end
    );
  end if;

  return v_meta;
end;
$function$;

-- ── is_ruined stays one release, as a mirror of quality ─────────────────────
-- Nothing in this release reads or writes it. It is NOT dropped here because migrations apply on
-- push while the frontend deploys separately: the bundle already in every open tab inserts
-- `is_ruined: false` from about fifteen inventory paths (seeding, sending, claims, the stash), and
-- would get an unknown-column error on each until reloaded. So for one release the trigger keeps it
-- an echo of quality rather than a second answer: an old client's `is_ruined: true` on a copied
-- row becomes 'ruined', and every row's flag is rewritten from quality on every write, so an old
-- client reading it still sees the truth. The drop is its own migration once this release is live (#1113).
create function private.party_inventory_is_ruined_mirror()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_op = 'INSERT' and new.is_ruined and new.quality = 'standard' then
    new.quality := 'ruined';
  end if;
  new.is_ruined := new.quality = 'ruined';
  return new;
end;
$$;

revoke execute on function private.party_inventory_is_ruined_mirror() from public, anon, authenticated;

create trigger party_inventory_is_ruined_mirror
  before insert or update on public.party_inventory
  for each row execute procedure private.party_inventory_is_ruined_mirror();

comment on column public.party_inventory.is_ruined is
  'Deprecated by quality (#1102): a mirror of quality = ''ruined'' kept one release for clients loaded before it; read quality.';
