/**
 * Which `class_choices` keys the generic "Choices" card is allowed to render.
 *
 * `party_members.class_choices` is a loose `Record<string, unknown>` JSONB bag
 * that holds more than the player's build choices. Two families of keys must
 * NOT surface in the read-only Choices list:
 *
 *  1. Keys with a dedicated player-facing card, or applied elsewhere on the
 *     sheet (metamagic, invocations, maneuvers, background feat/ASI). Showing
 *     them here would duplicate those cards.
 *
 *  2. Turn-scoped combat bookkeeping written by the spellcasting engine. By DB
 *     convention (migration 20260720000045) any key ending in `_turn` is a
 *     transient marker whose value is an encounter turn key
 *     (`encounterId:round:combatantIndex`, built by `private.active_turn_key`),
 *     never a build choice. e.g. `noncantrip_spell_turn`, `bonus_action_spell_turn`,
 *     `spell_slot_cast_turn`, `arcane_apotheosis_turn`. Rendering one leaks a raw
 *     `<uuid>:5:4` string to the player.
 */
const DEDICATED_OR_APPLIED_KEYS = new Set([
  "metamagic_options",
  "infusions_known",
  "eldritch_invocations",
  "battle_master_maneuvers",
  "background_feat",
  "background_asi",
]);

/**
 * True when a `class_choices` key is internal bookkeeping / owned by another
 * card and must be excluded from the generic Choices list.
 */
export function isInternalChoiceKey(key: string): boolean {
  return DEDICATED_OR_APPLIED_KEYS.has(key) || key.endsWith("_turn");
}
