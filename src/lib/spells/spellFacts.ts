import type { Spell } from "@/types/spell.types";

/**
 * How a spell's casting facts are worded. One home for what the desktop sheet
 * and the phone sheet both print, so a custom field or a new component word is
 * handled once.
 */

type CastingSource = Pick<
  Spell,
  | "casting_time"
  | "casting_time_custom"
  | "range"
  | "range_custom"
  | "duration"
  | "duration_custom"
  | "components"
  | "material"
>;

const COMPONENT_WORDS: Record<string, string> = { V: "Verbal", S: "Somatic", M: "Material" };

/** "Verbal, Somatic, Material (a pinch of sulphur)". */
export function spellComponentsInWords(spell: Pick<Spell, "components" | "material">): string {
  const line = spell.components.map((c) => COMPONENT_WORDS[c.toUpperCase()] ?? c).join(", ");
  return spell.material ? `${line} (${spell.material})` : line;
}

/** A custom value, when the DM wrote one, wins over the picked option. */
export function spellCastingTime(spell: Pick<CastingSource, "casting_time" | "casting_time_custom">): string {
  return spell.casting_time_custom || spell.casting_time;
}

export function spellRange(spell: Pick<CastingSource, "range" | "range_custom">): string {
  return spell.range_custom || spell.range;
}

export function spellDuration(spell: Pick<CastingSource, "duration" | "duration_custom">): string {
  return spell.duration_custom || spell.duration;
}

/** True when the duration text does not already say it, so a badge is not doubled. */
export function needsConcentrationNote(spell: Pick<Spell, "concentration" | "duration" | "duration_custom">): boolean {
  return spell.concentration && !/concentration/i.test(spellDuration(spell));
}
