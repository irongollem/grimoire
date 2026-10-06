-- Migration: table_content_at_creation
-- A character may take its table's homebrew class or subclass while it is
-- being made, before it has been seated.
--
-- The creation wizard writes the class row while the character is still in its
-- player's pool (`campaign_id` null) and attaches it to the table afterwards,
-- so the table's review sees every choice at once (#943). Both definition
-- triggers admitted only the character's own campaign's rows, official rows
-- and the character's own account's rows, so a table's homebrew could not be
-- chosen at creation at all: a 2014 cleric at a table with its own Arcana
-- Domain was offered official domains only, and once one was set, level-up
-- never asked again.
--
-- The rule, in one place for both triggers: a character may take a definition
-- that is
--   * scoped to the character's own campaign;
--   * official, or owned by the character's creator, its owner or the writer;
--   * global homebrew of a DM of a table the writer sits at (the rows RLS
--     already lets that writer read, `private.is_dm_of_my_campaigns`); or
--   * homebrew a DM of that table keeps for a table the writer sits at.
-- What the table then accepts is still the attach review's call
-- (`private.assess_content`), which approves the table's own homebrew and
-- flags anything else; this only stops the write from being refused outright.
-- A DM's homebrew kept for one of their OTHER tables stays out: the writer
-- would have to sit at that table too.

create function private.character_may_take_definition(
  p_member_id uuid,
  p_definition_campaign_id uuid,
  p_definition_owner uuid
)
returns boolean
language sql
stable
set search_path = ''
as $$
  -- Total, never NULL: `in (...)` over a NULL owner answers NULL, and a caller
  -- reading the result negated would fall through (CLAUDE.md, definer item 3).
  select coalesce((
    select p_definition_campaign_id = member.campaign_id
      or (p_definition_campaign_id is null and (
        p_definition_owner is null
        or p_definition_owner in (member.user_id, member.owner_user_id, auth.uid())
        or private.is_dm_of_my_campaigns(p_definition_owner)))
      or (p_definition_campaign_id is not null
        and private.is_campaign_member(p_definition_campaign_id)
        and private.is_table_dm(p_definition_campaign_id, p_definition_owner))
    from public.party_members member
    where member.id = p_member_id
  ), false);
$$;

-- Called only from the two definer triggers below, which run as their owner;
-- no client role has any business calling it.
revoke execute on function private.character_may_take_definition(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.validate_character_subclass_definition()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_name text; v_class_name text; v_ruleset text;
begin
  if new.subclass_name is null then
    new.subclass_definition_id := null;
    delete from public.ruleset_reviews
    where character_class_id = new.id and flag_type = 'subclass';
    return new;
  end if;
  if new.subclass_definition_id is null then return new; end if;
  v_ruleset := private.party_member_ruleset(new.party_member_id);
  select definition.subclass_name, definition.class_name
    into v_name, v_class_name
  from public.custom_subclasses definition
  where definition.id = new.subclass_definition_id
    and (definition.ruleset is null or definition.ruleset = v_ruleset)
    and private.character_may_take_definition(new.party_member_id, definition.campaign_id, definition.user_id);
  if v_name is null then raise exception 'Subclass definition is unavailable for ruleset %', v_ruleset; end if;
  if v_name <> new.subclass_name or v_class_name <> new.class_name then
    raise exception 'Subclass definition does not match the selected class and subclass';
  end if;
  delete from public.ruleset_reviews
  where character_class_id = new.id and flag_type = 'subclass';
  return new;
end;
$function$;

create or replace function public.validate_character_class_definition()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_name text; v_ruleset text;
begin
  if new.class_definition_id is null then return new; end if;
  v_ruleset := private.party_member_ruleset(new.party_member_id);
  if new.class_definition_kind = 'system' then
    select class_name into v_name from public.system_classes
    where id = new.class_definition_id and ruleset = v_ruleset;
  else
    select definition.class_name into v_name from public.custom_classes definition
    where definition.id = new.class_definition_id
      and (definition.ruleset is null or definition.ruleset = v_ruleset)
      and private.character_may_take_definition(new.party_member_id, definition.campaign_id, definition.user_id);
  end if;
  if v_name is null then raise exception 'Class definition is unavailable for ruleset %', v_ruleset; end if;
  if v_name <> new.class_name then raise exception 'Class definition does not match class name'; end if;
  delete from public.ruleset_reviews
  where character_class_id = new.id and flag_type = 'class';
  return new;
end;
$function$;
