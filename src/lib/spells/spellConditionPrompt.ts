/**
 * What the spell generator is told about `condition_effect` (#1021, row 5b): the one field a fight reads to impose a
 * condition. It is appended to the stored `spell` system prompt by both paths (the `generate-entity-text` function and
 * the browser-key path in `src/ai/entityTextGeneration.ts`), so the two build the same prompt, and the stored row
 * needs no migration to teach it. No imports: an edge function reads this file.
 */
export const SPELL_CONDITION_EFFECT_PROMPT = `

Also return "condition_effect": what the spell does to a creature besides damage, so a fight can apply it. Do not return "condition_inflicted"; it is no longer used.
State a condition only when the description you wrote says it in words. Use "not_simple" when the effect depends on a choice, on hit points or on a table. The fourteen condition names are the only conditions: Blinded, Charmed, Deafened, Frightened, Grappled, Incapacitated, Invisible, Paralyzed, Petrified, Poisoned, Prone, Restrained, Stunned, Unconscious.
"condition_effect" is null when you are unsure, or an object with exactly these keys:
- "verdict": "condition" (it imposes one or more of those conditions), "no_condition" (it imposes none) or "not_simple".
- "conditions": the condition names it imposes together; [] unless the verdict is "condition".
- "stops_casting": "verbal" (no speech or sound allowed), "all" (no spellcasting at all) or null.
- "speed_zero": true only when the description says their speed becomes 0 in addition to the conditions.
- "applies": "failed_save", "hit" or "automatic" (no roll); null unless the verdict is "condition".
- "save_ability": "STR", "DEX", "CON", "INT", "WIS" or "CHA", the save that avoids it; null unless "applies" is "failed_save".
- "targets": { "kind": "one" | "several" | "area" | "self", "count": 1 for one or self, a number of 2 or more for several, null for area, "more_per_slot_above": extra targets per slot level above the spell's own, usually 0 }; null unless the verdict is "condition".
- "only_kinds": creature types it is limited to, lower case ("humanoid"); [] for any creature.
- "duration": { "unit": "instant" | "round" | "minute" | "hour" | "until_dispelled" | "special", "amount": a number for round, minute or hour, otherwise null, "concentration": whether the spell needs concentration }; null unless the verdict is "condition".
- "repeat_save": { "when": "end_of_its_turn" | "start_of_its_turn" | "when_damaged" | "as_an_action", "ability": a save ability } when the creature may save again to end it, otherwise null.
- "ends_when_harmed": "by_casters_side" (until you or your allies harm it), "by_anyone" (until it takes any damage) or null.
- "break_free": { "abilities": the abilities it may check with, "skill": "athletics", "acrobatics" or null } when it may use its action on a check against your spell save DC to get free, otherwise null.
- "must_flee": true only when the description says it must move away from you while the condition lasts.
- "leaves_play": always false.`;
