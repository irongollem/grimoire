-- A held subclass option no longer blocks a character's level-ups (CodeRabbit
-- on #1028, after 20261008165034 had already shipped).
--
-- validate_character_subclass_definition checked the variant on every update
-- that names it, and apply_level_up names subclass_variant in every class
-- update. So once an author renamed or removed a terrain a character held, that
-- character could never level up again, and the wizard did not ask for a new
-- option because one was held. The option is now checked only when it is
-- chosen: on insert, or when the variant or the subclass changes. A stale
-- option is harmless: private.sync_subclass_spells grants nothing for it, and
-- the client counts it as unchosen and asks again.
--
-- Same body as 20261008165034 apart from that condition. create or replace
-- keeps the function's grants and the trigger that calls it.

create or replace function public.validate_character_subclass_definition()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_name text; v_class_name text; v_ruleset text; v_variants jsonb; v_expanded_variants jsonb;
begin
  if new.subclass_name is null then
    new.subclass_definition_id := null;
    new.subclass_variant := null;
    delete from public.ruleset_reviews
    where character_class_id = new.id and flag_type = 'subclass';
    return new;
  end if;
  if new.subclass_definition_id is null then
    if new.subclass_variant is not null then
      raise exception 'A subclass variant needs a subclass definition';
    end if;
    return new;
  end if;
  v_ruleset := private.party_member_ruleset(new.party_member_id);
  select definition.subclass_name, definition.class_name, definition.spell_variants, definition.expanded_spell_variants
    into v_name, v_class_name, v_variants, v_expanded_variants
  from public.custom_subclasses definition
  where definition.id = new.subclass_definition_id
    and (definition.ruleset is null or definition.ruleset = v_ruleset)
    and private.character_may_take_definition(new.party_member_id, definition.campaign_id, definition.user_id);
  if v_name is null then raise exception 'Subclass definition is unavailable for ruleset %', v_ruleset; end if;
  if v_name <> new.subclass_name or v_class_name <> new.class_name then
    raise exception 'Subclass definition does not match the selected class and subclass';
  end if;
  -- Swapping subclass without naming a variant must not carry the old one over.
  if tg_op = 'UPDATE'
     and new.subclass_definition_id is distinct from old.subclass_definition_id
     and new.subclass_variant is not distinct from old.subclass_variant then
    new.subclass_variant := null;
  end if;
  if new.subclass_variant is not null
     and (tg_op = 'INSERT'
          or new.subclass_variant is distinct from old.subclass_variant
          or new.subclass_definition_id is distinct from old.subclass_definition_id)
     and not (jsonb_typeof(v_variants) = 'object' and v_variants ? new.subclass_variant)
     and not (jsonb_typeof(v_expanded_variants) = 'object' and v_expanded_variants ? new.subclass_variant) then
    raise exception '% is not an option of the % subclass', new.subclass_variant, v_name;
  end if;
  delete from public.ruleset_reviews
  where character_class_id = new.id and flag_type = 'subclass';
  return new;
end;
$function$;
