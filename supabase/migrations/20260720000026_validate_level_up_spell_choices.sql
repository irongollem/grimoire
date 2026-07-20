-- Make spell acquisition part of the trusted, atomic level-up transaction.
-- The client picker remains guidance; this RPC derives the required number of
-- class spell and cantrip choices from server-owned edition/class data.
create or replace function public.required_level_up_spell_choices(
  p_member_id uuid,
  p_class_name text,
  p_new_class_level integer,
  p_definition_kind text default null,
  p_definition_id uuid default null
)
returns table (spell_count integer, cantrip_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ruleset text;
  v_policy public.class_spellcasting_policies%rowtype;
  v_caster_type text;
  v_spells_known jsonb;
  v_cantrips_known integer[];
  v_current integer;
  v_previous integer;
  v_wizard_spell_count integer;
begin
  if p_new_class_level < 1 or p_new_class_level > 20 then
    raise exception 'Class level must be between 1 and 20';
  end if;

  select coalesce(c.ruleset, '2014') into strict v_ruleset
  from public.party_members pm join public.campaigns c on c.id = pm.campaign_id
  where pm.id = p_member_id;

  -- The Wizard spellbook's 6-at-level-1 / 2-per-level-thereafter acquisition
  -- rule is identical whether resolved via the pinned system policy below or
  -- the system/custom-class fallback; compute it once instead of twice.
  if p_class_name = 'Wizard' and coalesce(p_definition_kind, 'system') = 'system' then
    v_wizard_spell_count := case when p_new_class_level = 1 then 6 else 2 end;
  end if;

  select * into v_policy from public.class_spellcasting_policies
  where ruleset = v_ruleset and class_name = p_class_name
    and coalesce(p_definition_kind, 'system') = 'system';

  if found then
    if v_wizard_spell_count is not null then
      spell_count := v_wizard_spell_count;
    elsif v_policy.prepared_limit is not null then
      v_current := coalesce(v_policy.prepared_limit[p_new_class_level], 0);
      v_previous := case when p_new_class_level = 1 then 0
        else coalesce(v_policy.prepared_limit[p_new_class_level - 1], 0) end;
      spell_count := greatest(0, v_current - v_previous);
    else
      spell_count := 0;
    end if;
    if v_policy.cantrip_limit is not null then
      v_current := coalesce(v_policy.cantrip_limit[p_new_class_level], 0);
      v_previous := case when p_new_class_level = 1 then 0
        else coalesce(v_policy.cantrip_limit[p_new_class_level - 1], 0) end;
      cantrip_count := greatest(0, v_current - v_previous);
    else
      cantrip_count := 0;
    end if;
    return next;
    return;
  end if;

  select caster_type, spells_known, cantrips_known
    into v_caster_type, v_spells_known, v_cantrips_known
  from public.system_classes where class_name = p_class_name
    and (p_definition_id is null or id = p_definition_id)
    and coalesce(p_definition_kind, 'system') = 'system' limit 1;
  if not found then
    select cc.caster_type, cc.spells_known, cc.cantrips_known
      into v_caster_type, v_spells_known, v_cantrips_known
    from public.custom_classes cc
    join public.party_members pm on pm.id = p_member_id
    where cc.class_name = p_class_name
      and (p_definition_id is null or cc.id = p_definition_id)
      and coalesce(p_definition_kind, 'custom') = 'custom'
      and (cc.campaign_id = pm.campaign_id
        or (cc.campaign_id is null and cc.user_id in (pm.user_id, pm.owner_user_id)))
    order by (cc.campaign_id is not null) desc limit 1;
  end if;

  if v_wizard_spell_count is not null then
    spell_count := v_wizard_spell_count;
  elsif v_caster_type = 'known' and v_spells_known is not null then
    v_current := coalesce((v_spells_known ->> (p_new_class_level - 1))::integer, 0);
    v_previous := case when p_new_class_level = 1 then 0
      else coalesce((v_spells_known ->> (p_new_class_level - 2))::integer, 0) end;
    spell_count := greatest(0, v_current - v_previous);
  else
    spell_count := 0;
  end if;
  if v_cantrips_known is not null then
    v_current := coalesce(v_cantrips_known[p_new_class_level], 0);
    v_previous := case when p_new_class_level = 1 then 0
      else coalesce(v_cantrips_known[p_new_class_level - 1], 0) end;
    cantrip_count := greatest(0, v_current - v_previous);
  else
    cantrip_count := 0;
  end if;
  return next;
end;
$$;

revoke all on function public.required_level_up_spell_choices(uuid, text, integer, text, uuid)
  from public, anon, authenticated;

create or replace function public.apply_level_up(
  p_member_id uuid,
  p_member_update jsonb,
  p_class_op jsonb default null,
  p_spell_rows jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_source_class_id uuid;
  v_class_name text;
  v_old_class_level integer;
  v_new_class_level integer;
  v_old_member_level integer;
  v_required_spells integer;
  v_required_cantrips integer;
  v_submitted_spells integer;
  v_submitted_cantrips integer;
  v_definition_id uuid;
  v_definition_kind text;
begin
  select level into v_old_member_level from public.party_members
  where id = p_member_id
    and (user_id = v_uid or owner_user_id = v_uid or private.is_campaign_dm(campaign_id));
  if not found then
    raise exception 'apply_level_up: not authorized for member %', p_member_id using errcode = '42501';
  end if;
  if not (p_member_update ? 'level') or (p_member_update->>'level')::integer <> v_old_member_level + 1 then
    raise exception 'apply_level_up: member level must increase by exactly one';
  end if;
  if p_class_op is null then
    raise exception 'apply_level_up: a source class operation is required';
  end if;

  if p_class_op->>'op' = 'add' then
    v_class_name := nullif(p_class_op->>'class_name', '');
    v_definition_id := nullif(p_class_op->>'class_definition_id', '')::uuid;
    v_definition_kind := nullif(p_class_op->>'class_definition_kind', '');
    v_new_class_level := (p_class_op->>'levels')::integer;
    -- A legacy DM-built character may seed its first detailed class row at the
    -- member's new total level. A true multiclass addition must start at one.
    if exists (select 1 from public.character_classes where party_member_id = p_member_id)
       and v_new_class_level <> 1 then
      raise exception 'apply_level_up: a new multiclass must start at level one';
    end if;
  elsif p_class_op->>'op' = 'update' then
    v_source_class_id := (p_class_op->>'id')::uuid;
    select class_name, levels, class_definition_id, class_definition_kind
      into v_class_name, v_old_class_level, v_definition_id, v_definition_kind
    from public.character_classes where id = v_source_class_id and party_member_id = p_member_id;
    if not found then raise exception 'apply_level_up: source class not found'; end if;
    v_new_class_level := (p_class_op->>'levels')::integer;
    if v_new_class_level <> v_old_class_level + 1 then
      raise exception 'apply_level_up: class level must increase by exactly one';
    end if;
  else
    raise exception 'apply_level_up: invalid class operation';
  end if;
  if v_class_name is null then raise exception 'apply_level_up: class name is required'; end if;

  select spell_count, cantrip_count into v_required_spells, v_required_cantrips
  from public.required_level_up_spell_choices(
    p_member_id, v_class_name, v_new_class_level, v_definition_kind, v_definition_id
  );
  select
    count(distinct r->>'spell_id') filter (where public.character_spell_level(r->>'spell_id') > 0),
    count(distinct r->>'spell_id') filter (where public.character_spell_level(r->>'spell_id') = 0)
  into v_submitted_spells, v_submitted_cantrips
  from jsonb_array_elements(coalesce(p_spell_rows, '[]'::jsonb)) r
  where coalesce(r->>'source_type', 'class') = 'class'
    and not coalesce((r->>'always_prepared')::boolean, false);
  if v_submitted_spells <> v_required_spells or v_submitted_cantrips <> v_required_cantrips then
    raise exception 'apply_level_up: % level % requires % spell and % cantrip choices (received % and %)',
      v_class_name, v_new_class_level, v_required_spells, v_required_cantrips,
      v_submitted_spells, v_submitted_cantrips;
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_spell_rows, '[]'::jsonb)) r
    where coalesce(r->>'source_type', 'class') = 'class'
      and nullif(r->>'source_class_id', '') is not null
      and (v_source_class_id is null or (r->>'source_class_id')::uuid <> v_source_class_id)
  ) then
    raise exception 'apply_level_up: spell choices must use the class being leveled';
  end if;
  if v_source_class_id is not null and exists (
    select 1 from jsonb_array_elements(coalesce(p_spell_rows, '[]'::jsonb)) r
    join public.character_spells existing
      on existing.party_member_id = p_member_id
      and existing.source_class_id = v_source_class_id
      and existing.source_type = 'class'
      and existing.spell_id = r->>'spell_id'
    where coalesce(r->>'source_type', 'class') = 'class'
      and not coalesce((r->>'always_prepared')::boolean, false)
  ) then
    raise exception 'apply_level_up: a required choice must be new for the source class';
  end if;

  update public.party_members set
    level = (p_member_update->>'level')::int,
    proficiency_bonus = case when p_member_update ? 'proficiency_bonus' then (p_member_update->>'proficiency_bonus')::int else proficiency_bonus end,
    max_hp = case when p_member_update ? 'max_hp' then (p_member_update->>'max_hp')::int else max_hp end,
    current_hp = case when p_member_update ? 'current_hp' then (p_member_update->>'current_hp')::int else current_hp end,
    hit_dice_remaining = case when p_member_update ? 'hit_dice_remaining' then (p_member_update->>'hit_dice_remaining')::int else hit_dice_remaining end,
    str = case when p_member_update ? 'str' then (p_member_update->>'str')::int else str end,
    dex = case when p_member_update ? 'dex' then (p_member_update->>'dex')::int else dex end,
    con = case when p_member_update ? 'con' then (p_member_update->>'con')::int else con end,
    "int" = case when p_member_update ? 'int' then (p_member_update->>'int')::int else "int" end,
    wis = case when p_member_update ? 'wis' then (p_member_update->>'wis')::int else wis end,
    cha = case when p_member_update ? 'cha' then (p_member_update->>'cha')::int else cha end,
    subclass = case when p_member_update ? 'subclass' then p_member_update->>'subclass' else subclass end,
    spell_slots = case when p_member_update ? 'spell_slots' then p_member_update->'spell_slots' else spell_slots end,
    class_resources = case when p_member_update ? 'class_resources' then p_member_update->'class_resources' else class_resources end,
    class_choices = case when p_member_update ? 'class_choices' then p_member_update->'class_choices' else class_choices end,
    level_choices = case when p_member_update ? 'level_choices' then p_member_update->'level_choices' else level_choices end,
    tool_proficiencies = case when p_member_update ? 'tool_proficiencies'
      then array(select jsonb_array_elements_text(p_member_update->'tool_proficiencies')) else tool_proficiencies end
  where id = p_member_id;

  if p_class_op->>'op' = 'add' then
    insert into public.character_classes
      (party_member_id, class_name, class_definition_id, class_definition_kind,
       subclass_name, subclass_definition_id, levels, is_primary, hit_dice_used, sort_order)
    values (p_member_id, v_class_name, v_definition_id, v_definition_kind,
      p_class_op->>'subclass_name', nullif(p_class_op->>'subclass_definition_id', '')::uuid, v_new_class_level,
      coalesce((p_class_op->>'is_primary')::boolean, false),
      coalesce((p_class_op->>'hit_dice_used')::int, 0), coalesce((p_class_op->>'sort_order')::int, 0))
    returning id into v_source_class_id;
  else
    update public.character_classes set levels = v_new_class_level,
      subclass_name = case when p_class_op ? 'subclass_name' then p_class_op->>'subclass_name' else subclass_name end,
      subclass_definition_id = case when p_class_op ? 'subclass_name'
        then nullif(p_class_op->>'subclass_definition_id', '')::uuid else subclass_definition_id end
    where id = v_source_class_id;
  end if;

  insert into public.character_spells
    (party_member_id, spell_id, is_known, is_prepared, always_prepared,
     source_class_id, source_type, source_label, uses_per_day, uses_remaining, resets_on)
  select p_member_id, r->>'spell_id', coalesce((r->>'is_known')::boolean, true),
    coalesce((r->>'is_prepared')::boolean, false), coalesce((r->>'always_prepared')::boolean, false),
    case when coalesce(r->>'source_type', 'class') = 'class'
      then coalesce(nullif(r->>'source_class_id', '')::uuid, v_source_class_id) else null end,
    coalesce(r->>'source_type', 'class'), r->>'source_label',
    nullif(r->>'uses_per_day', '')::int, nullif(r->>'uses_remaining', '')::int, nullif(r->>'resets_on', '')
  from jsonb_array_elements(coalesce(p_spell_rows, '[]'::jsonb)) r
  on conflict do nothing;
end;
$$;

revoke all on function public.apply_level_up(uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.apply_level_up(uuid, jsonb, jsonb, jsonb) to authenticated;
