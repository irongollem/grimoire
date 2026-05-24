-- Migration: party_members_deity_id
-- Add deity_id FK to party_members so characters can link to a campaign deity entity

alter table party_members
  add column deity_id uuid references deities(id) on delete set null;

-- Update assume_character RPC to copy deity_id when cloning a character
create or replace function assume_character(
  p_source_member_id uuid,
  p_target_user_id   uuid
) returns uuid
language plpgsql security definer
as $$
declare
  v_new_id uuid;
begin
  insert into party_members (
    campaign_id, user_id, name, class, subclass, level, background_id,
    species_id, race, subrace,
    disguise_species_id, disguise_race, disguise_subrace,
    alignment, deity, deity_id, age, gender, pronouns, physical_description,
    personality_traits, ideals, bonds, flaws, notes,
    strength, dexterity, constitution, intelligence, wisdom, charisma,
    strength_save_prof, dexterity_save_prof, constitution_save_prof,
    intelligence_save_prof, wisdom_save_prof, charisma_save_prof,
    skill_proficiencies, tool_proficiencies, languages,
    armor_class, initiative_bonus, speed, hit_points, max_hit_points, temp_hit_points,
    hit_dice, hit_dice_used,
    conditions, exhaustion_level,
    death_save_successes, death_save_failures,
    spell_slots, spell_slots_used,
    portrait_url, portrait_focal_point,
    is_companion, companion_owner_id,
    health_visibility
  )
  select
    campaign_id, p_target_user_id, name, class, subclass, level, background_id,
    species_id, race, subrace,
    disguise_species_id, disguise_race, disguise_subrace,
    alignment, deity, deity_id, age, gender, pronouns, physical_description,
    personality_traits, ideals, bonds, flaws, notes,
    strength, dexterity, constitution, intelligence, wisdom, charisma,
    strength_save_prof, dexterity_save_prof, constitution_save_prof,
    intelligence_save_prof, wisdom_save_prof, charisma_save_prof,
    skill_proficiencies, tool_proficiencies, languages,
    armor_class, initiative_bonus, speed, hit_points, max_hit_points, temp_hit_points,
    hit_dice, hit_dice_used,
    conditions, exhaustion_level,
    death_save_successes, death_save_failures,
    spell_slots, spell_slots_used,
    portrait_url, portrait_focal_point,
    is_companion, companion_owner_id,
    health_visibility
  from party_members
  where id = p_source_member_id
  returning id into v_new_id;

  return v_new_id;
end;
$$;
