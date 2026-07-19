-- Atomically spend one slot from the requested level. The party-member row lock
-- prevents concurrent casts from reading and replacing the same stale JSON.
create or replace function public.spend_spell_slot(
  p_party_member_id uuid,
  p_slot_level integer
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
begin
  if p_slot_level < 1 or p_slot_level > 9 then
    raise exception 'Spell slot level must be between 1 and 9';
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
  if jsonb_array_length(v_slots) = 0 then
    raise exception 'No level-% spell slot pool exists', p_slot_level;
  end if;

  for v_index in 0..jsonb_array_length(v_slots) - 1 loop
    v_slot := v_slots -> v_index;
    if (v_slot ->> 'level')::integer = p_slot_level then
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

revoke all on function public.spend_spell_slot(uuid, integer) from public, anon;
grant execute on function public.spend_spell_slot(uuid, integer) to authenticated;
