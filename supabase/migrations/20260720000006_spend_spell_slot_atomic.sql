-- Atomically spend one slot from the requested level. The party-member row lock
-- prevents concurrent casts from reading and replacing the same stale JSON.
drop function if exists public.spend_spell_slot(uuid, integer);
drop function if exists public.spend_spell_slot(uuid, integer, jsonb);

create or replace function public.spend_spell_slot(
  p_party_member_id uuid,
  p_slot_level integer,
  p_slot_pool text,
  p_slot_template jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.party_members%rowtype;
  v_slots jsonb;
  v_slot jsonb;
  v_index integer;
  v_used integer;
  v_max integer;
  v_template_slot jsonb;
  v_existing_slot jsonb;
  v_reconciled jsonb := '[]'::jsonb;
begin
  if p_slot_level < 1 or p_slot_level > 9 then
    raise exception 'Spell slot level must be between 1 and 9';
  end if;
  if p_slot_pool not in ('spellcasting', 'pact', 'temporary', 'feature') then
    raise exception 'Invalid spell slot pool';
  end if;

  select * into v_member
  from public.party_members
  where id = p_party_member_id
  for update;

  if not found then
    raise exception 'Party member not found';
  end if;

  if not (
    v_member.user_id = (select auth.uid())
    or v_member.owner_user_id = (select auth.uid())
    or public.is_campaign_dm(v_member.campaign_id)
    or exists (
      select 1
      from public.campaign_members cm
      where cm.user_id = (select auth.uid())
        and cm.party_member_id = v_member.id
    )
  ) then
    raise exception 'Access denied';
  end if;

  v_slots := coalesce(v_member.spell_slots, '[]'::jsonb);
  if jsonb_typeof(v_slots) <> 'array' then
    raise exception 'Invalid spell slot state';
  end if;

  -- The UI can derive the authoritative slot maxima for legacy characters and
  -- after a campaign ruleset change. Reconcile those maxima under the same row
  -- lock while retaining as much of the persisted usage as remains valid.
  if p_slot_template is not null then
    if jsonb_typeof(p_slot_template) <> 'array' then
      raise exception 'Invalid spell slot template';
    end if;

    for v_template_slot in select value from jsonb_array_elements(p_slot_template)
    loop
      if coalesce((v_template_slot ->> 'level')::integer, 0) not between 1 and 9
         or coalesce((v_template_slot ->> 'max')::integer, -1) < 0 then
        raise exception 'Invalid spell slot template entry';
      end if;

      select value into v_existing_slot
      from jsonb_array_elements(v_slots)
      where (value ->> 'level')::integer = (v_template_slot ->> 'level')::integer
        and coalesce(value ->> 'pool', 'spellcasting') = coalesce(v_template_slot ->> 'pool', 'spellcasting')
      limit 1;

      v_reconciled := v_reconciled || jsonb_build_array(jsonb_build_object(
        'level', (v_template_slot ->> 'level')::integer,
        'max', (v_template_slot ->> 'max')::integer,
        'pool', coalesce(v_template_slot ->> 'pool', 'spellcasting'),
        'recovery', coalesce(v_template_slot ->> 'recovery', case when v_template_slot ->> 'pool' = 'pact' then 'short' else 'long' end),
        'used', least(
          coalesce((v_existing_slot ->> 'used')::integer, (v_template_slot ->> 'used')::integer, 0),
          (v_template_slot ->> 'max')::integer
        )
      ));
      v_existing_slot := null;
    end loop;

    if jsonb_array_length(v_reconciled) > 0 then
      v_slots := v_reconciled;
    end if;
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

      v_slots := jsonb_set(
        v_slots,
        array[v_index::text, 'used'],
        to_jsonb(v_used + 1),
        false
      );

      update public.party_members
      set spell_slots = v_slots
      where id = p_party_member_id;

      return v_slots;
    end if;
  end loop;

  raise exception 'No level-% spell slot pool exists', p_slot_level;
end;
$$;

revoke all on function public.spend_spell_slot(uuid, integer, text, jsonb) from public, anon;
grant execute on function public.spend_spell_slot(uuid, integer, text, jsonb) to authenticated;
