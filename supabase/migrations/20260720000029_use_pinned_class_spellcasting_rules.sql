-- Spell eligibility and limits resolve through the class version pinned on the
-- character, never through the first same-named content row.
create or replace function public.validate_character_spell_source()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_class public.character_classes%rowtype;
  v_member public.party_members%rowtype;
  v_policy public.class_spellcasting_policies%rowtype;
  v_spell_level integer;
  v_spell_classes text[];
  v_spell_slots jsonb;
  v_cantrips_known integer[];
  v_row jsonb;
  v_max_spell_level integer := 0;
  v_index integer;
begin
  if new.source_type <> 'class' then
    if new.source_class_id is not null then raise exception 'Non-class spell grants cannot reference a source class'; end if;
    return new;
  end if;
  if new.source_class_id is null then raise exception 'Class spells require a source class'; end if;
  select * into v_class from public.character_classes
    where id = new.source_class_id and party_member_id = new.party_member_id;
  if not found then raise exception 'Spell source class does not belong to this character'; end if;
  select * into strict v_member from public.party_members where id = new.party_member_id;

  select level, classes into v_spell_level, v_spell_classes from public.srd_spells where id = new.spell_id;
  if not found then select level, classes into v_spell_level, v_spell_classes from public.spells where id::text = new.spell_id; end if;
  if not found then raise exception 'Spell does not exist'; end if;
  if not new.always_prepared and not (v_class.class_name = any(coalesce(v_spell_classes, '{}'::text[]))) then
    raise exception '% is not on the % spell list', new.spell_id, v_class.class_name;
  end if;

  if coalesce(v_class.class_definition_kind, 'system') = 'system' then
    select policy.* into v_policy from public.class_spellcasting_policies policy
    join public.campaigns campaign on campaign.id = v_member.campaign_id
    where policy.ruleset = coalesce(campaign.ruleset, '2014') and policy.class_name = v_class.class_name;
  end if;
  if v_policy.ruleset is not null then
    if v_spell_level = 0 and v_policy.cantrip_limit is null and not new.always_prepared then
      raise exception '% does not have a cantrip progression', v_class.class_name;
    end if;
    v_max_spell_level := v_policy.max_spell_level[least(v_class.levels, 20)];
  else
    if coalesce(v_class.class_definition_kind, 'system') = 'system' then
      select spell_slots, cantrips_known into v_spell_slots, v_cantrips_known
      from public.system_classes where class_name = v_class.class_name
        and (v_class.class_definition_id is null or id = v_class.class_definition_id) limit 1;
      -- A row that predates class_definition_kind pinning (kind is NULL, not
      -- explicitly 'system') may actually be homebrew that happens to share a
      -- name with no matching system class. Restore the old name-based
      -- custom_classes fallback for that legacy case.
      if not found and v_class.class_definition_kind is null then
        select spell_slots, cantrips_known into v_spell_slots, v_cantrips_known
        from public.custom_classes cc
        where cc.class_name = v_class.class_name
          and (cc.campaign_id = v_member.campaign_id
            or (cc.campaign_id is null and cc.user_id in (v_member.user_id, v_member.owner_user_id)))
        order by (cc.campaign_id is not null) desc limit 1;
      end if;
    else
      select spell_slots, cantrips_known into v_spell_slots, v_cantrips_known
      from public.custom_classes where id = v_class.class_definition_id;
    end if;
    if not found or v_spell_slots is null then raise exception '% is not configured as a spellcasting class', v_class.class_name; end if;
    if v_spell_level = 0 then
      if v_cantrips_known is null and not new.always_prepared then raise exception '% does not have a cantrip progression', v_class.class_name; end if;
      return new;
    end if;
    v_row := v_spell_slots -> (least(v_class.levels, 20) - 1);
    if v_row is null or jsonb_typeof(v_row) <> 'array' then
      raise exception 'Missing spell-slot progression for % level %', v_class.class_name, v_class.levels;
    end if;
    if jsonb_array_length(v_row) > 0 then
      for v_index in 0..least(jsonb_array_length(v_row), 9) - 1 loop
        if coalesce((v_row ->> v_index)::integer, 0) > 0 then v_max_spell_level := v_index + 1; end if;
      end loop;
    end if;
  end if;
  if v_spell_level > 0 and v_spell_level > v_max_spell_level then
    raise exception 'A level-% % cannot acquire a level-% spell', v_class.levels, v_class.class_name, v_spell_level;
  end if;
  return new;
end;
$$;

create or replace function public.validate_character_spell_limits()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_class public.character_classes%rowtype;
  v_member public.party_members%rowtype;
  v_policy public.class_spellcasting_policies%rowtype;
  v_caster_type text;
  v_spells_known jsonb;
  v_cantrips_known integer[];
  v_prepared_ability text;
  v_prepared_divisor integer;
  v_spell_level integer;
  v_limit integer;
  v_existing integer;
  v_score integer;
begin
  if new.source_type <> 'class' or new.always_prepared then return new; end if;
  select * into strict v_class from public.character_classes where id = new.source_class_id;
  select * into strict v_member from public.party_members where id = new.party_member_id;
  v_spell_level := public.character_spell_level(new.spell_id);

  if coalesce(v_class.class_definition_kind, 'system') = 'system' then
    select policy.* into v_policy from public.class_spellcasting_policies policy
    join public.campaigns campaign on campaign.id = v_member.campaign_id
    where policy.ruleset = coalesce(campaign.ruleset, '2014') and policy.class_name = v_class.class_name;
  end if;
  if v_policy.ruleset is not null then
    if v_spell_level = 0 then
      v_limit := v_policy.cantrip_limit[least(v_class.levels, 20)];
    else
      v_limit := v_policy.prepared_limit[least(v_class.levels, 20)];
      if v_policy.caster_type <> 'spellbook' then new.is_prepared := true; end if;
      if v_policy.caster_type = 'spellbook' and not new.is_prepared then return new; end if;
    end if;
    if v_limit is null then return new; end if;
    select count(*) into v_existing from public.character_spells existing
    where existing.party_member_id = new.party_member_id and existing.source_class_id = new.source_class_id
      and existing.source_type = 'class' and not existing.always_prepared
      and ((v_spell_level = 0 and public.character_spell_level(existing.spell_id) = 0)
        or (v_spell_level > 0 and public.character_spell_level(existing.spell_id) > 0))
      and (v_spell_level = 0 or v_policy.caster_type <> 'spellbook' or existing.is_prepared)
      and existing.id is distinct from new.id;
    if v_existing >= v_limit then
      raise exception '% can prepare at most % % at class level %', v_class.class_name, v_limit,
        case when v_spell_level = 0 then 'cantrips' else 'spells' end, v_class.levels;
    end if;
    return new;
  end if;

  if coalesce(v_class.class_definition_kind, 'system') = 'system' then
    select caster_type, spells_known, cantrips_known, prepared_ability, prepared_divisor
      into v_caster_type, v_spells_known, v_cantrips_known, v_prepared_ability, v_prepared_divisor
    from public.system_classes where class_name = v_class.class_name
      and (v_class.class_definition_id is null or id = v_class.class_definition_id) limit 1;
  else
    select caster_type, spells_known, cantrips_known, prepared_ability, prepared_divisor
      into v_caster_type, v_spells_known, v_cantrips_known, v_prepared_ability, v_prepared_divisor
    from public.custom_classes where id = v_class.class_definition_id;
  end if;
  if v_spell_level = 0 then
    v_limit := v_cantrips_known[least(v_class.levels, 20)];
  elsif v_caster_type = 'known' then
    v_limit := nullif(v_spells_known ->> (least(v_class.levels, 20) - 1), '')::integer;
  elsif new.is_prepared and v_caster_type in ('prepared', 'spellbook') then
    v_score := case v_prepared_ability when 'int' then v_member."int" when 'wis' then v_member.wis
      when 'cha' then v_member.cha else 10 end;
    v_limit := greatest(1, floor((v_score - 10)::numeric / 2)::integer
      + floor(v_class.levels::numeric / greatest(coalesce(v_prepared_divisor, 1), 1))::integer);
  else
    return new;
  end if;
  if v_limit is null then return new; end if;
  select count(*) into v_existing from public.character_spells existing
  where existing.party_member_id = new.party_member_id and existing.source_class_id = new.source_class_id
    and existing.source_type = 'class' and not existing.always_prepared
    and ((v_spell_level = 0 and public.character_spell_level(existing.spell_id) = 0)
      or (v_spell_level > 0 and public.character_spell_level(existing.spell_id) > 0))
    and (v_spell_level = 0 or v_caster_type = 'known' or existing.is_prepared)
    and existing.id is distinct from new.id;
  if v_existing >= v_limit then raise exception '% spell limit of % reached', v_class.class_name, v_limit; end if;
  return new;
end;
$$;

revoke all on function public.validate_character_spell_source() from public, anon, authenticated;
revoke all on function public.validate_character_spell_limits() from public, anon, authenticated;
