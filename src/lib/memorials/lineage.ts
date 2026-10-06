import type { CharacterMemorial } from "@/types/memorial.types";

const ORDINALS = [
  "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
  "eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth",
  "eighteenth", "nineteenth", "twentieth",
];

function levelPhrase(level: number): string {
  const word = ORDINALS[level - 1];
  return word ? `of the ${word} level` : `level ${level}`;
}

/** "Brewling cleric of the sixth level", or null when class and level are both unknown. */
export function memorialLineage(
  m: Pick<CharacterMemorial, "species_name" | "class_name" | "level">,
): string | null {
  if (m.class_name === null && m.level === null) return null;
  const parts: string[] = [];
  if (m.species_name) parts.push(m.species_name);
  if (m.class_name) parts.push(m.species_name ? m.class_name.toLowerCase() : m.class_name);
  if (m.level !== null) parts.push(levelPhrase(m.level));
  const text = parts.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
