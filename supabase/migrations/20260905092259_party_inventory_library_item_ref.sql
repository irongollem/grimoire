-- #815 — let a carried item reference shared library content instead of a copy.
--
-- `party_inventory.item_id` is a uuid FK to `items(id)`, written before the
-- shared library existed. `library_items.id` is text, so a player picking any
-- library item got `invalid input syntax for type uuid` (22P02) on the insert
-- — the whole shared catalogue was selectable and none of it was addable.
--
-- The workaround that grew instead was per-account copies: one long-standing
-- account carries 673 legacy rows shadowing a library row by name, which is
-- precisely the duplication the shared library was built to remove. A sibling
-- column keeps referential integrity on both sides rather than widening
-- `item_id` to text and dropping its foreign key.
--
-- Exactly one of the two may be set. Both null stays legal: a party_inventory
-- row can be free text with no catalogue entry behind it at all, which is how
-- improvised loot ("a bloodied ledger") is recorded today.

alter table party_inventory
  add column library_item_id text
    references library_items(id) on delete set null;

comment on column party_inventory.library_item_id is
  'Reference to shared library content. Mutually exclusive with item_id, which references the owner''s own items row. See #815.';

alter table party_inventory
  add constraint party_inventory_one_item_ref
    check (num_nonnulls(item_id, library_item_id) <= 1);

-- `assume_character` enumerates inventory columns explicitly when it deep-copies
-- a DM-managed character onto a player. Left alone it would silently drop the
-- new reference, so a player assuming a character would lose every piece of
-- library-referenced gear while keeping its name — the bug this migration
-- exists to prevent, reintroduced through the back door.
--
-- Recreated verbatim apart from that one column pair. The authorization checks
-- (unclaimed DM-managed character, caller is a player in the same campaign) and
-- the pinned search_path are unchanged.
create or replace function public.assume_character(p_original_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller        uuid := auth.uid();
  v_original      party_members%rowtype;
  v_membership    campaign_members%rowtype;
  v_new_id        uuid;
begin
  -- Load the original character
  select * into v_original from party_members where id = p_original_id;
  if not found then
    raise exception 'Character not found';
  end if;

  -- Verify it is an unclaimed DM-managed character
  if not (v_original.is_dm_managed and v_original.owner_user_id is null) then
    raise exception 'Character is not available for assumption';
  end if;

  -- Verify the caller is a player in the same campaign
  select * into v_membership
  from campaign_members
  where campaign_id = v_original.campaign_id
    and user_id = v_caller
    and role = 'player'
  limit 1;
  if not found then
    raise exception 'Not a campaign player';
  end if;

  -- Deep-copy party_members with the player as owner
  insert into party_members (
    user_id, owner_user_id, is_dm_managed, campaign_id,
    name, player_name, class, subclass, level,
    max_hp, current_hp, temp_hp, ac, speed, initiative_bonus, current_initiative,
    str, dex, con, int, wis, cha,
    proficiency_bonus, skill_proficiencies, saving_throw_proficiencies,
    conditions, inspiration, death_save_successes, death_save_failures,
    notes, sort_order, portrait_url, curses,
    cp, sp, ep, gp, pp,
    tool_proficiencies, languages, portrait_focal_point,
    spell_slots, current_location_id, carry_capacity_override,
    class_resources, class_choices, hit_dice_remaining,
    subrace, species_id, background_id,
    disguise_species_id, disguise_race, disguise_subrace,
    concentration, alignment, personality_traits, ideals, bonds, flaws,
    deity, experience_points, age, gender, pronouns, physical_description,
    level_choices, wildshape_state, wildshapes_used, wildshape_reset, ac_formula,
    height, active_infusions, rage_active, player_description
  )
  select
    user_id, v_caller, false, campaign_id,
    name, player_name, class, subclass, level,
    max_hp, current_hp, temp_hp, ac, speed, initiative_bonus, current_initiative,
    str, dex, con, int, wis, cha,
    proficiency_bonus, skill_proficiencies, saving_throw_proficiencies,
    conditions, inspiration, death_save_successes, death_save_failures,
    notes, sort_order, portrait_url, curses,
    cp, sp, ep, gp, pp,
    tool_proficiencies, languages, portrait_focal_point,
    spell_slots, current_location_id, carry_capacity_override,
    class_resources, class_choices, hit_dice_remaining,
    subrace, species_id, background_id,
    disguise_species_id, disguise_race, disguise_subrace,
    concentration, alignment, personality_traits, ideals, bonds, flaws,
    deity, experience_points, age, gender, pronouns, physical_description,
    level_choices, wildshape_state, wildshapes_used, wildshape_reset, ac_formula,
    height, active_infusions, rage_active, player_description
  from party_members where id = p_original_id
  returning id into v_new_id;

  -- Copy character_classes rows
  insert into character_classes (party_member_id, class_name, subclass_name, levels, is_primary, hit_dice_used, sort_order)
  select v_new_id, class_name, subclass_name, levels, is_primary, hit_dice_used, sort_order
  from character_classes
  where party_member_id = p_original_id;

  -- Copy character_spells rows
  insert into character_spells (party_member_id, spell_id, is_known, is_prepared, source_class_id, source_type, uses_per_day, uses_remaining, resets_on, source_label)
  select v_new_id, spell_id, is_known, is_prepared, source_class_id, source_type, uses_per_day, uses_remaining, resets_on, source_label
  from character_spells
  where party_member_id = p_original_id;

  -- Copy party_inventory rows (reassign carried_by to the new character)
  insert into party_inventory (campaign_id, user_id, item_id, library_item_id, name, quantity, carried_by, is_attuned, notes, is_equipped, location, slot, is_container, container_id, is_ruined, current_charges, sort_order, is_identified, curse_revealed)
  select campaign_id, user_id, item_id, library_item_id, name, quantity, v_new_id, is_attuned, notes, is_equipped, location, slot, is_container, container_id, is_ruined, current_charges, sort_order, is_identified, curse_revealed
  from party_inventory
  where carried_by = p_original_id;

  -- Set the new character as the player's active character
  update campaign_members
  set party_member_id = v_new_id
  where id = v_membership.id;

  return v_new_id;
end;
$function$;

-- `craft_apply` echoes a fetched inventory row straight back on a ruin: the
-- client passes the primary ingredient's `item_id` so the "Ruined: X" row it
-- creates still points at the same item. With library references now possible,
-- that value can be a text id, and the uuid cast below would fail exactly the
-- way the original bug did — a new crash path opened by the fix for the old
-- one. Both insert paths therefore carry the pair.
--
-- Success rows gain it for the same reason, ahead of need: recipe outputs are
-- still uuid-only, but the day `crafting_recipe_outputs` learns to name shared
-- content (#815, second slice) this function must already be able to write it.
--
-- SECURITY INVOKER, unchanged — this one runs as the caller and leans on RLS.
create or replace function public.craft_apply(
  p_ingredients jsonb,
  p_outcome text,
  p_success_rows jsonb default '[]'::jsonb,
  p_ruined_row jsonb default null::jsonb
)
returns void
language plpgsql
set search_path to 'public'
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_ing record;
begin
  -- Consume each ingredient by its required quantity; delete the row only when
  -- the stack is fully used up.
  if p_ingredients is not null then
    for v_ing in
      select (x->>'id')::uuid as id, (x->>'qty')::int as qty
      from jsonb_array_elements(coalesce(p_ingredients, '[]'::jsonb)) as x
    loop
      if v_ing.id is null or v_ing.qty is null or v_ing.qty <= 0 then
        continue;
      end if;
      update party_inventory
        set quantity = quantity - v_ing.qty
        where id = v_ing.id;
      delete from party_inventory
        where id = v_ing.id and quantity <= 0;
    end loop;
  end if;

  if p_outcome = 'success' then
    insert into party_inventory
      (campaign_id, user_id, item_id, library_item_id, name, quantity, carried_by, location, is_ruined)
    select
      x.campaign_id, v_uid, x.item_id, x.library_item_id, x.name, x.quantity, x.carried_by, 'backpack', false
    from jsonb_to_recordset(coalesce(p_success_rows, '[]'::jsonb))
      as x(campaign_id uuid, item_id uuid, library_item_id text, name text, quantity integer, carried_by uuid);

  elsif p_outcome = 'ruin' and p_ruined_row is not null then
    insert into party_inventory
      (campaign_id, user_id, item_id, library_item_id, name, quantity, carried_by, location, notes, is_ruined)
    values (
      (p_ruined_row->>'campaign_id')::uuid, v_uid,
      nullif(p_ruined_row->>'item_id', '')::uuid,
      nullif(p_ruined_row->>'library_item_id', ''),
      p_ruined_row->>'name', 1,
      nullif(p_ruined_row->>'carried_by', '')::uuid,
      'backpack', 'Ruined during a failed crafting attempt.', true
    );
  end if;
end;
$function$;
