-- Migration: assume_character_rpc_and_rls
-- Adds party_members RLS for DM-offered chars + assume_character RPC for player handoff

-- ── party_members SELECT: allow players to see unclaimed DM-offered characters ──
drop policy if exists "party_members_select" on party_members;

create policy "party_members_select" on party_members for select using (
  -- DM sees everything in their campaigns
  (campaign_id is not null and is_campaign_dm(campaign_id))
  -- Owner sees their own character
  or ((select auth.uid()) = owner_user_id)
  -- Player sees their linked character (via campaign_members)
  or (campaign_id is not null and is_campaign_member(campaign_id) and exists (
    select 1 from campaign_members cm where cm.party_member_id = party_members.id
  ))
  -- Any campaign player can see DM-offered unclaimed characters (needed to browse + assume)
  or (campaign_id is not null and is_dm_managed = true and owner_user_id is null
    and is_campaign_member(campaign_id))
);

-- ── assume_character RPC ──────────────────────────────────────────────────────
-- Atomically deep-copies a DM-offered character into the caller's ownership
-- and sets it as the caller's active character for the campaign.
create or replace function public.assume_character(p_original_id uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
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
  insert into party_inventory (campaign_id, user_id, item_id, name, quantity, carried_by, is_attuned, notes, is_equipped, location, slot, is_container, container_id, is_ruined, current_charges, sort_order, is_identified, curse_revealed)
  select campaign_id, user_id, item_id, name, quantity, v_new_id, is_attuned, notes, is_equipped, location, slot, is_container, container_id, is_ruined, current_charges, sort_order, is_identified, curse_revealed
  from party_inventory
  where carried_by = p_original_id;

  -- Set the new character as the player's active character
  update campaign_members
  set party_member_id = v_new_id
  where id = v_membership.id;

  return v_new_id;
end;
$$;

grant execute on function public.assume_character(uuid) to authenticated;
