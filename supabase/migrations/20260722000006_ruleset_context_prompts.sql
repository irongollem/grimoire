-- Migration: ruleset_context_prompts
-- Ruleset-aware AI generation (#564): two admin-editable context blocks that
-- every generator appends to its system prompt based on the campaign's
-- ruleset. Keyed like every other prompt (generator_type unique), so the
-- admin Prompts tab picks them up with no UI change.

insert into ai_system_prompts (generator_type, label, content) values
(
  'ruleset_context_2014',
  'Ruleset context — 5e 2014 (SRD 5.1)',
  '## Rules edition
This campaign uses the D&D 5e 2014 rules (SRD 5.1). Use classic 2014 conventions and terminology: races (not species), the 2014 exhaustion table (six distinct levels), background features without ability score increases, and 2014-style monster stat blocks (no separate initiative bonus). Do not reference 2024-only mechanics such as Weapon Mastery or Heroic Inspiration.'
),
(
  'ruleset_context_2024',
  'Ruleset context — 5e 2024 (SRD 5.2)',
  '## Rules edition
This campaign uses the D&D 5e 2024 rules (SRD 5.2). Use 2024 conventions and terminology:
- Say "species", not "race"; "Heroic Inspiration", not "Inspiration".
- Monster stat blocks include an initiative bonus: when generating a monster, set stat_block.initiative_bonus (DEX modifier, higher for initiative-proficient creatures) and stat_block.proficiency_bonus.
- Weapons have a Mastery property: when generating a weapon, set "mastery" to exactly one of "cleave", "graze", "nick", "push", "sap", "slow", "topple", "vex" (omit or null for non-weapons).
- Exhaustion is a flat penalty: each level gives -2 to all D20 Tests and -5 ft Speed; death at level 6.
- Backgrounds grant an ability score trio and an Origin feat; species grant no ability score increases.
- Conditions use SRD 5.2 wording (e.g. Incapacitated breaks Concentration; Grappled gives Disadvantage only against targets other than the grappler).'
)
on conflict (generator_type) do nothing;
