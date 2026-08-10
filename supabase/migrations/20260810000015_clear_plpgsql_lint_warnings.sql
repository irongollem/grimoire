-- Clear warning-level PL/pgSQL lint without breaking active RPC callers.
-- Two legacy parameters remain in their public signatures for compatibility,
-- but are explicitly ignored; authorization and attribution still derive from
-- trusted server/auth state. The remaining changes remove dead declarations.

create or replace function public.reset_subscription_credits(
  p_user_id uuid,
  p_subscription_id text,
  p_period_start date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowance integer;
  v_current bigint;
  v_delta bigint;
begin
  -- Compatibility input still sent by stripe-webhook. Period idempotency is
  -- keyed by user and period; never use this caller-supplied Stripe id as identity.
  perform p_subscription_id;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  if exists (
    select 1 from ai_credit_ledger
    where user_id = p_user_id
      and reason = 'subscription_topup'
      and subscription_period_start = p_period_start
  ) then
    return;
  end if;

  select coalesce(p.monthly_credits, 0) into v_allowance
  from user_subscriptions s
  join plans p on p.id = s.plan_id
  where s.user_id = p_user_id;
  v_allowance := coalesce(v_allowance, 0);

  select coalesce(sum(delta), 0) into v_current
  from ai_credit_ledger
  where user_id = p_user_id and bucket = 'subscription' and not pending;

  v_delta := v_allowance - v_current;

  insert into ai_credit_ledger
    (user_id, delta, reason, bucket, subscription_period_start)
  values
    (p_user_id, v_delta, 'subscription_topup', 'subscription', p_period_start);
exception when unique_violation then
  return;
end;
$$;

create or replace function public.grab_item_drop(
  p_message_id uuid,
  p_qty integer,
  p_claimer_user_id uuid,
  p_claimer_name text,
  p_party_member_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
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
  v_identified boolean;
  v_container boolean;
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
  v_identified := coalesce((v_meta->>'item_rarity') = 'mundane', false);
  v_container := coalesce((v_meta->>'is_container')::boolean, false);

  if v_item_id is not null then
    select id into v_existing from public.party_inventory
    where campaign_id = v_campaign_id
      and item_id = v_item_id
      and carried_by is not distinct from p_party_member_id
      and container_id is null
      and location in ('backpack', 'belt')
      and not is_ruined
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
      (campaign_id, user_id, item_id, name, quantity, carried_by, location,
       is_container, is_identified)
    values (
      v_campaign_id, auth.uid(), v_item_id,
      v_meta->>'item_name', v_to_grab, p_party_member_id, 'backpack',
      v_container, v_identified
    );
  end if;

  return jsonb_build_object(
    'qty_grabbed', v_to_grab,
    'quantity_remaining', v_qty_rem - v_to_grab
  );
end;
$$;

create or replace function public.spend_spell_slot(
  p_party_member_id uuid,
  p_slot_level integer,
  p_slot_pool text,
  p_slot_template jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.party_members%rowtype;
  v_slots jsonb;
  v_slot jsonb;
  v_used integer;
  v_max integer;
  v_template_slot jsonb;
begin
  if p_slot_level < 1 or p_slot_level > 9 then
    raise exception 'Spell slot level must be between 1 and 9';
  end if;
  if p_slot_pool not in ('spellcasting', 'pact', 'temporary') then
    raise exception 'Invalid spell slot pool';
  end if;

  select * into v_member from public.party_members
  where id = p_party_member_id for update;
  if not found then raise exception 'Party member not found'; end if;
  if not (
    v_member.user_id = (select auth.uid())
    or v_member.owner_user_id = (select auth.uid())
    or private.is_campaign_dm(v_member.campaign_id)
    or exists (
      select 1 from public.campaign_members cm
      where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id
    )
  ) then raise exception 'Access denied'; end if;

  v_slots := coalesce(v_member.spell_slots, '[]'::jsonb);
  if jsonb_typeof(v_slots) <> 'array' then raise exception 'Invalid spell slot state'; end if;

  if p_slot_template is not null then
    if jsonb_typeof(p_slot_template) <> 'array' then
      raise exception 'Invalid spell slot template';
    end if;
    for v_template_slot in select value from jsonb_array_elements(p_slot_template) loop
      if coalesce((v_template_slot ->> 'level')::integer, 0) not between 1 and 9
         or coalesce((v_template_slot ->> 'max')::integer, -1) < 0 then
        raise exception 'Invalid spell slot template entry';
      end if;
      if not exists (
        select 1 from jsonb_array_elements(v_slots) existing
        where (existing.value ->> 'level')::integer = (v_template_slot ->> 'level')::integer
          and coalesce(existing.value ->> 'pool', 'spellcasting') = coalesce(v_template_slot ->> 'pool', 'spellcasting')
      ) then
        v_slots := v_slots || jsonb_build_array(jsonb_build_object(
          'level', (v_template_slot ->> 'level')::integer,
          'max', (v_template_slot ->> 'max')::integer,
          'pool', coalesce(v_template_slot ->> 'pool', 'spellcasting'),
          'recovery', coalesce(v_template_slot ->> 'recovery',
            case when v_template_slot ->> 'pool' = 'pact' then 'short' else 'long' end),
          'used', least(coalesce((v_template_slot ->> 'used')::integer, 0), (v_template_slot ->> 'max')::integer)
        ));
      end if;
    end loop;
  end if;

  if jsonb_array_length(v_slots) = 0 then
    raise exception 'No level-% spell slot pool exists', p_slot_level;
  end if;

  for v_index in 0..jsonb_array_length(v_slots) - 1 loop
    v_slot := v_slots -> v_index;
    if (v_slot ->> 'level')::integer = p_slot_level
       and coalesce(v_slot ->> 'pool', 'spellcasting') = p_slot_pool then
      v_used := coalesce((v_slot ->> 'used')::integer, 0);
      v_max := coalesce((v_slot ->> 'max')::integer, 0);
      if v_used >= v_max then
        raise exception 'No level-% spell slots remaining', p_slot_level;
      end if;
      v_slots := jsonb_set(v_slots, array[v_index::text, 'used'], to_jsonb(v_used + 1), false);
      update public.party_members set spell_slots = v_slots where id = p_party_member_id;
      return v_slots;
    end if;
  end loop;
  raise exception 'No level-% spell slot pool exists', p_slot_level;
end;
$$;

create or replace function public.convert_sorcery_points_before_class_guard(
  p_party_member_id uuid,
  p_direction text,
  p_slot_level integer,
  p_slot_pool text default 'spellcasting'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.party_members%rowtype;
  v_slots jsonb;
  v_resources jsonb;
  v_resource jsonb;
  v_current integer;
  v_max integer;
  v_cost integer;
  v_slot jsonb;
  v_used integer;
  v_slot_max integer;
  v_found boolean := false;
begin
  if p_direction not in ('points_to_slot', 'slot_to_points') then raise exception 'Invalid Flexible Casting direction'; end if;
  if p_slot_level < 1 or p_slot_level > (case when p_direction = 'points_to_slot' then 5 else 9 end) then
    raise exception 'Invalid slot level for Flexible Casting';
  end if;
  if p_slot_pool not in ('spellcasting', 'pact', 'temporary', 'feature') then raise exception 'Invalid spell slot pool'; end if;

  select * into v_member from public.party_members where id = p_party_member_id for update;
  if not found then raise exception 'Party member not found'; end if;
  if not (
    v_member.user_id = (select auth.uid()) or v_member.owner_user_id = (select auth.uid())
    or private.is_campaign_dm(v_member.campaign_id)
    or exists (select 1 from public.campaign_members cm
      where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id)
  ) then raise exception 'Access denied'; end if;

  v_resources := coalesce(v_member.class_resources, '{}'::jsonb);
  v_resource := v_resources -> 'sorcery_points';
  if v_resource is null then raise exception 'Character has no Sorcery Points resource'; end if;
  v_current := coalesce((v_resource ->> 'current')::integer, 0);
  v_max := coalesce((v_resource ->> 'max')::integer, 0);
  v_slots := coalesce(v_member.spell_slots, '[]'::jsonb);
  if jsonb_typeof(v_slots) <> 'array' then raise exception 'Invalid spell slot state'; end if;

  if p_direction = 'points_to_slot' then
    v_cost := (array[2,3,5,6,7])[p_slot_level];
    if v_current < v_cost then raise exception 'Not enough Sorcery Points'; end if;
    v_current := v_current - v_cost;
    if jsonb_array_length(v_slots) > 0 then
      for v_index in 0..jsonb_array_length(v_slots) - 1 loop
        v_slot := v_slots -> v_index;
        if (v_slot ->> 'level')::integer = p_slot_level
           and coalesce(v_slot ->> 'pool', 'spellcasting') = 'temporary' then
          v_slot_max := coalesce((v_slot ->> 'max')::integer, 0);
          v_slots := jsonb_set(v_slots, array[v_index::text, 'max'], to_jsonb(v_slot_max + 1), false);
          v_found := true;
          exit;
        end if;
      end loop;
    end if;
    if not v_found then
      v_slots := v_slots || jsonb_build_array(jsonb_build_object(
        'level', p_slot_level, 'max', 1, 'used', 0, 'pool', 'temporary', 'recovery', 'none'
      ));
    end if;
  else
    if v_current + p_slot_level > v_max then raise exception 'Sorcery Points cannot exceed their maximum'; end if;
    if jsonb_array_length(v_slots) = 0 then raise exception 'No spell slots exist'; end if;
    for v_index in 0..jsonb_array_length(v_slots) - 1 loop
      v_slot := v_slots -> v_index;
      if (v_slot ->> 'level')::integer = p_slot_level
         and coalesce(v_slot ->> 'pool', 'spellcasting') = p_slot_pool then
        v_used := coalesce((v_slot ->> 'used')::integer, 0);
        v_slot_max := coalesce((v_slot ->> 'max')::integer, 0);
        if v_used >= v_slot_max then raise exception 'No selected spell slot remains'; end if;
        v_slots := jsonb_set(v_slots, array[v_index::text, 'used'], to_jsonb(v_used + 1), false);
        v_found := true;
        exit;
      end if;
    end loop;
    if not v_found then raise exception 'Selected spell slot pool does not exist'; end if;
    v_current := v_current + p_slot_level;
  end if;

  v_resources := jsonb_set(v_resources, '{sorcery_points,current}', to_jsonb(v_current), false);
  update public.party_members set spell_slots = v_slots, class_resources = v_resources
  where id = p_party_member_id;
  return jsonb_build_object('spell_slots', v_slots, 'class_resources', v_resources);
end;
$$;

create or replace function public.get_credit_calibration_hints()
returns table (
  generation_type text,
  current_cost integer,
  avg_actual_usd_cents numeric,
  sample_size bigint,
  suggested_cost integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min_samples constant int := 20;
  v_cents_per_credit numeric;
begin
  if not private.is_app_admin() then
    raise exception 'Admin only';
  end if;

  select
    case
      when stripe_unit_amount is not null then stripe_unit_amount::numeric / credits
      else eur_display * 100.0 / credits
    end
  into v_cents_per_credit
  from credit_pack_config
  where credits > 0 and (stripe_unit_amount is not null or eur_display > 0)
  order by
    case
      when stripe_unit_amount is not null then stripe_unit_amount::numeric / credits
      else eur_display * 100.0 / credits
    end desc
  limit 1;

  return query
  select
    agg.generation_type,
    cc.credit_cost::int,
    round(agg.avg_cents, 4),
    agg.sample_size,
    case
      when v_cents_per_credit is not null and agg.sample_size >= v_min_samples then
        greatest(1, round(agg.avg_cents / v_cents_per_credit))::int
      else null
    end
  from (
    select
      l.reason as generation_type,
      avg(g.estimated_cost_usd_cents) as avg_cents,
      count(*) as sample_size
    from ai_credit_ledger l
    join ai_generation_costs g on g.id = l.id
    where l.created_at >= now() - interval '30 days'
      and g.estimated_cost_usd_cents is not null
      and exists (
        select 1 from ai_generation_credit_costs cc2
        where cc2.generation_type = l.reason
      )
    group by l.reason
  ) agg
  join ai_generation_credit_costs cc on cc.generation_type = agg.generation_type
  order by agg.generation_type;
end;
$$;

-- CREATE OR REPLACE preserves the existing grants. Restate the sensitive
-- boundaries so a later privilege refactor cannot accidentally broaden them.
revoke execute on function public.reset_subscription_credits(uuid, text, date) from public, anon, authenticated;
grant execute on function public.reset_subscription_credits(uuid, text, date) to service_role;
revoke all on function public.spend_spell_slot(uuid, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.spend_spell_slot(uuid, integer, text, jsonb) to service_role;
revoke all on function public.convert_sorcery_points_before_class_guard(uuid, text, integer, text) from public, anon, authenticated;
