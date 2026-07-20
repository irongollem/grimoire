-- Arcane Apotheosis is once on each turn. Without an active encounter there is
-- no trusted turn boundary, so Metamagic still works but spends Sorcery Points.
create or replace function public.cast_character_spell_v2(
  p_party_member_id uuid, p_slot_level integer, p_slot_pool text,
  p_slot_template jsonb default null, p_concentration_state jsonb default null,
  p_metamagic_names text[] default '{}'::text[], p_character_spell_id uuid default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_member public.party_members%rowtype; v_spell public.character_spells%rowtype;
  v_result jsonb; v_resources jsonb; v_choices jsonb; v_ruleset text;
  v_level integer; v_name text; v_cost integer; v_total integer := 0; v_limit integer := 1;
  v_current integer; v_known boolean; v_active boolean; v_turn_key text; v_free_used boolean := false;
begin
  select * into v_member from public.party_members where id = p_party_member_id for update;
  if not found then raise exception 'Party member not found'; end if;
  if not (v_member.user_id = (select auth.uid()) or v_member.owner_user_id = (select auth.uid())
    or private.is_campaign_dm(v_member.campaign_id)
    or exists (select 1 from public.campaign_members cm where cm.user_id = (select auth.uid()) and cm.party_member_id = v_member.id))
  then raise exception 'Access denied'; end if;
  select coalesce(c.ruleset, '2014') into v_ruleset from public.campaigns c where c.id = v_member.campaign_id;
  v_level := public.sorcerer_level(v_member);
  v_choices := coalesce(v_member.class_choices, '{}'::jsonb);
  v_active := coalesce((v_choices ->> 'innate_sorcery_active')::boolean, false)
    and coalesce((v_choices ->> 'innate_sorcery_expires_at')::timestamptz, '-infinity') > now();
  if coalesce(array_length(p_metamagic_names, 1), 0) > 0 and v_level < 2 then
    raise exception 'Metamagic requires an eligible Sorcerer';
  end if;
  if v_ruleset = '2024' and v_level >= 7 and v_active then v_limit := 2; end if;
  if coalesce(array_length(p_metamagic_names, 1), 0) > v_limit then
    raise exception 'Too many Metamagic options for this casting';
  end if;
  if coalesce(array_length(p_metamagic_names, 1), 0)
     <> coalesce(array_length(array(select distinct unnest(p_metamagic_names)), 1), 0) then
    raise exception 'A Metamagic option cannot be applied twice';
  end if;

  v_turn_key := private.active_turn_key(v_member.campaign_id);
  foreach v_name in array coalesce(p_metamagic_names, '{}'::text[]) loop
    if jsonb_typeof(v_choices -> 'metamagic_options') = 'array' then
      select exists(select 1 from jsonb_array_elements_text(v_choices -> 'metamagic_options') x where x = v_name) into v_known;
    else v_known := v_choices ->> 'metamagic_options' = v_name;
    end if;
    if not v_known then raise exception 'Character does not know %', v_name; end if;
    v_cost := case v_name
      when 'Quickened Spell' then 2
      when 'Heightened Spell' then case when v_ruleset = '2024' then 2 else 3 end
      when 'Seeking Spell' then case when v_ruleset = '2024' then 1 else 2 end
      when 'Twinned Spell' then case when v_ruleset = '2024' then 1 else greatest(p_slot_level, 1) end
      when 'Careful Spell' then 1 when 'Distant Spell' then 1 when 'Empowered Spell' then 1
      when 'Extended Spell' then 1 when 'Subtle Spell' then 1 when 'Transmuted Spell' then 1
      else null end;
    if v_cost is null then raise exception 'Unsupported Metamagic option'; end if;
    if v_ruleset = '2024' and v_level >= 18 and v_active and not v_free_used
       and v_turn_key is not null
       and v_choices ->> 'arcane_apotheosis_turn' is distinct from v_turn_key then
      v_free_used := true;
      v_choices := jsonb_set(v_choices, '{arcane_apotheosis_turn}', to_jsonb(v_turn_key), true);
    else
      v_total := v_total + v_cost;
    end if;
  end loop;
  v_resources := coalesce(v_member.class_resources, '{}'::jsonb);
  v_current := coalesce((v_resources #>> '{sorcery_points,current}')::integer, 0);
  if v_current < v_total then raise exception 'Not enough Sorcery Points'; end if;
  if v_total > 0 then
    v_resources := jsonb_set(v_resources, '{sorcery_points,current}', to_jsonb(v_current - v_total), false);
  end if;
  update public.party_members set class_resources = v_resources, class_choices = v_choices where id = v_member.id;

  if p_character_spell_id is not null then
    select * into v_spell from public.character_spells
    where id = p_character_spell_id and party_member_id = p_party_member_id for update;
    if not found then raise exception 'Innate spell grant not found'; end if;
    if v_spell.source_type = 'class' then raise exception 'Class spell cannot spend an innate use'; end if;
    if v_spell.uses_per_day is not null and coalesce(v_spell.uses_remaining, 0) <= 0 then
      raise exception 'No innate spell uses remaining';
    end if;
  end if;
  v_result := public.cast_character_spell(p_party_member_id, p_slot_level, p_slot_pool,
    p_slot_template, p_concentration_state, null);
  if p_character_spell_id is not null and v_spell.uses_per_day is not null then
    update public.character_spells set uses_remaining = uses_remaining - 1 where id = p_character_spell_id;
    v_result := v_result || jsonb_build_object('uses_remaining', v_spell.uses_remaining - 1);
  end if;
  return v_result || jsonb_build_object('metamagic_cost', v_total, 'arcane_apotheosis_free', v_free_used);
end;
$$;

revoke all on function public.cast_character_spell_v2(uuid, integer, text, jsonb, jsonb, text[], uuid)
  from public, anon, authenticated;
