-- One transaction now owns slot debit, Sorcery Point debit, and concentration
-- replacement. Chat/roll side effects happen only after this succeeds.
create or replace function public.cast_character_spell(
  p_party_member_id uuid,
  p_slot_level integer,
  p_slot_pool text,
  p_slot_template jsonb default null,
  p_concentration_state jsonb default null,
  p_metamagic_name text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.party_members%rowtype;
  v_slots jsonb;
  v_resources jsonb;
  v_sp_current integer;
  v_sp_cost integer := 0;
  v_ruleset text;
  v_known_metamagic boolean := false;
begin
  if p_slot_level < 0 or p_slot_level > 9 then raise exception 'Invalid cast level'; end if;
  select * into v_member from public.party_members where id = p_party_member_id for update;
  if not found then raise exception 'Party member not found'; end if;
  if not (
    v_member.user_id = (select auth.uid()) or v_member.owner_user_id = (select auth.uid())
    or private.is_campaign_dm(v_member.campaign_id)
    or exists (select 1 from public.campaign_members cm
      where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id)
  ) then raise exception 'Access denied'; end if;

  if p_metamagic_name is not null then
    if jsonb_typeof(v_member.class_choices -> 'metamagic_options') = 'array' then
      select exists (
        select 1 from jsonb_array_elements_text(v_member.class_choices -> 'metamagic_options') value
        where value = p_metamagic_name
      ) into v_known_metamagic;
    else
      v_known_metamagic := v_member.class_choices ->> 'metamagic_options' = p_metamagic_name;
    end if;
    if not v_known_metamagic then raise exception 'Character does not know %', p_metamagic_name; end if;
    select coalesce(c.ruleset, '2014') into v_ruleset from public.campaigns c where c.id = v_member.campaign_id;
    v_sp_cost := case p_metamagic_name
      when 'Quickened Spell' then 2
      when 'Heightened Spell' then case when v_ruleset = '2024' then 2 else 3 end
      when 'Seeking Spell' then case when v_ruleset = '2024' then 1 else 2 end
      when 'Twinned Spell' then case when v_ruleset = '2024' then 1 else greatest(p_slot_level, 1) end
      when 'Careful Spell' then 1
      when 'Distant Spell' then 1
      when 'Empowered Spell' then 1
      when 'Extended Spell' then 1
      when 'Subtle Spell' then 1
      when 'Transmuted Spell' then 1
      else null end;
    if v_sp_cost is null then raise exception 'Unsupported Metamagic option'; end if;
    v_resources := coalesce(v_member.class_resources, '{}'::jsonb);
    v_sp_current := coalesce((v_resources #>> '{sorcery_points,current}')::integer, 0);
    if v_sp_current < v_sp_cost then raise exception 'Not enough Sorcery Points'; end if;
    v_resources := jsonb_set(v_resources, '{sorcery_points,current}', to_jsonb(v_sp_current - v_sp_cost), false);
  else
    v_resources := v_member.class_resources;
  end if;

  if p_slot_level > 0 then
    v_slots := public.spend_spell_slot(p_party_member_id, p_slot_level, p_slot_pool, p_slot_template);
  else
    v_slots := v_member.spell_slots;
  end if;

  if p_concentration_state is not null
     and (jsonb_typeof(p_concentration_state) <> 'object'
       or nullif(p_concentration_state ->> 'spellName', '') is null) then
    raise exception 'Invalid concentration state';
  end if;

  update public.party_members
  set class_resources = v_resources,
      concentration = case when p_concentration_state is null then concentration else p_concentration_state end
  where id = p_party_member_id;

  return jsonb_build_object(
    'spell_slots', v_slots,
    'class_resources', v_resources,
    'concentration', case when p_concentration_state is null then v_member.concentration else p_concentration_state end,
    'metamagic_cost', v_sp_cost
  );
end;
$$;

revoke all on function public.cast_character_spell(uuid, integer, text, jsonb, jsonb, text) from public, anon;
grant execute on function public.cast_character_spell(uuid, integer, text, jsonb, jsonb, text) to authenticated;
