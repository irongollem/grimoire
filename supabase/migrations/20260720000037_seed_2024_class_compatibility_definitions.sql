-- Every campaign ruleset needs a selectable system class identity. Until a
-- class has a fully reviewed revised feature record, carry forward only its
-- stable chassis and spell-slot progression; edition-specific feature/choice
-- automation stays empty rather than silently applying 2014 text.
insert into public.system_classes (
  class_name, hit_die, primary_ability, saving_throws, armor_proficiencies,
  weapon_proficiencies, subclass_level, features, asi_levels, spell_slots,
  spells_known, slot_recovery, steps, resources, caster_type,
  prepared_ability, prepared_divisor, cantrips_known, ruleset,
  conceptual_key, source_document_key, source_record_key, source_revision,
  source_license, provenance
)
select
  original.class_name, original.hit_die, original.primary_ability,
  original.saving_throws, original.armor_proficiencies,
  original.weapon_proficiencies, original.subclass_level,
  '{}'::jsonb, original.asi_levels, original.spell_slots,
  original.spells_known, original.slot_recovery, '[]'::jsonb, '[]'::jsonb,
  original.caster_type, original.prepared_ability, original.prepared_divisor,
  original.cantrips_known, '2024', original.conceptual_key,
  'grimoire-2024-compatibility', '2024:' || lower(original.class_name),
  'SRD 5.2 spellcasting compatibility', original.source_license,
  jsonb_build_object(
    'derived_from_ruleset', '2014',
    'scope', 'stable class chassis and spellcasting progression only',
    'feature_automation', 'manual until reviewed'
  )
from public.system_classes original
where original.ruleset = '2014'
on conflict (ruleset, class_name) do nothing;

-- Revised Paladins and Rangers receive level-1 spellcasting. Later half-caster
-- rows match the existing progression.
update public.system_classes set spell_slots = jsonb_set(
  spell_slots, '{0}', '[2,0,0,0,0,0,0,0,0]'::jsonb, true
)
where ruleset = '2024' and class_name in ('Paladin', 'Ranger')
  and spell_slots is not null;
