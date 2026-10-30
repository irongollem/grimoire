-- A level-up asks for the spells the character's own ruleset grants.
--
-- Called without a class definition id, `required_level_up_spell_choices` read
-- the class's `system_classes` row by name alone, with `limit 1`. Every system
-- class has two rows, 2014 and 2024, so which one it got was up to the planner:
-- a 2014 Sorcerer could be handed the 2024 row, whose caster type is
-- `prepared`, and be asked to learn no spells at all. CI's replay happened to
-- return the 2014 row and a local stack the 2024 one, which is how
-- `character_ruleset.test.sql` test 16 failed only locally. An unpinned read now
-- takes the row for `private.party_member_ruleset`, which is total ('2014' when
-- the member has none); a pinned id still names its row exactly. The body is
-- otherwise unchanged from `20261013001003`, and `create or replace` keeps the
-- existing grants.

CREATE OR REPLACE FUNCTION public.required_level_up_spell_choices(p_member_id uuid, p_class_name text, p_new_class_level integer, p_definition_kind text DEFAULT NULL::text, p_definition_id uuid DEFAULT NULL::uuid, p_subclass_definition_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(spell_count integer, cantrip_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ruleset text;
  v_policy public.class_spellcasting_policies%rowtype;
  v_caster_type text;
  v_spells_known jsonb;
  v_cantrips_known integer[];
  v_current integer;
  v_previous integer;
  v_wizard_spell_count integer;
  v_subclass jsonb;
begin
  if p_new_class_level < 1 or p_new_class_level > 20 then
    raise exception 'Class level must be between 1 and 20';
  end if;

  if not exists (select 1 from public.party_members pm where pm.id = p_member_id) then
    raise exception 'Party member not found' using errcode = 'P0002';
  end if;
  v_ruleset := private.party_member_ruleset(p_member_id);

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
    and (id = p_definition_id or (p_definition_id is null and ruleset = v_ruleset))
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
        or (cc.campaign_id is null
          and (cc.user_id is null or cc.user_id in (pm.user_id, pm.owner_user_id))))
    order by (cc.campaign_id is not null) desc, (cc.user_id is not null) desc limit 1;
  end if;

  -- A class that does not cast takes its subclass's casting (a third caster).
  if coalesce(v_caster_type, 'none') = 'none' then
    v_subclass := private.subclass_casting(p_member_id, p_class_name, p_definition_kind, p_definition_id, p_subclass_definition_id);
    if v_subclass is not null then
      v_caster_type := v_subclass ->> 'caster_type';
      v_spells_known := v_subclass -> 'spells_known';
      v_cantrips_known := private.jsonb_int_array(v_subclass -> 'cantrips_known');
    end if;
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
$function$;
