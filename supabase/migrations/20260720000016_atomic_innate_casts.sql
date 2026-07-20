-- Extend the shared cast transaction with an optional limited-use spell row.
-- The wrapper locks the use first, then delegates slot/SP/concentration work to
-- cast_character_spell; any later failure rolls the entire transaction back.
create or replace function public.cast_character_spell(
  p_party_member_id uuid,
  p_slot_level integer,
  p_slot_pool text,
  p_slot_template jsonb,
  p_concentration_state jsonb,
  p_metamagic_name text,
  p_character_spell_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_spell public.character_spells%rowtype;
  v_result jsonb;
begin
  if p_character_spell_id is not null then
    select * into v_spell from public.character_spells
    where id = p_character_spell_id and party_member_id = p_party_member_id
    for update;
    if not found then raise exception 'Innate spell grant not found'; end if;
    if v_spell.source_type = 'class' then raise exception 'Class spell cannot spend an innate use'; end if;
    if v_spell.uses_per_day is not null and coalesce(v_spell.uses_remaining, 0) <= 0 then
      raise exception 'No innate spell uses remaining';
    end if;
  end if;

  v_result := public.cast_character_spell(
    p_party_member_id, p_slot_level, p_slot_pool, p_slot_template,
    p_concentration_state, p_metamagic_name
  );

  if p_character_spell_id is not null and v_spell.uses_per_day is not null then
    update public.character_spells
    set uses_remaining = uses_remaining - 1
    where id = p_character_spell_id;
    v_result := v_result || jsonb_build_object('uses_remaining', v_spell.uses_remaining - 1);
  end if;
  return v_result;
end;
$$;

revoke all on function public.cast_character_spell(uuid, integer, text, jsonb, jsonb, text, uuid) from public, anon;
grant execute on function public.cast_character_spell(uuid, integer, text, jsonb, jsonb, text, uuid) to authenticated;
