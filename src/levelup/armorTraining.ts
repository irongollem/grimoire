import type { PrerequisiteCharacter } from "@/rules/features/prerequisites";

/**
 * The armor categories a class's proficiency list trains, for feat prerequisites
 * ("Medium armor training"). The list is prose ("Light armor", "Shields",
 * "All armor"), so it is read here and nowhere else.
 */
export function armorTrainingOf(proficiencies: readonly string[]): PrerequisiteCharacter["armorProficiencies"] {
  const trained = new Set<"light" | "medium" | "heavy" | "shield">();
  for (const line of proficiencies) {
    const text = line.toLowerCase();
    if (/\ball armou?r\b/.test(text)) {
      for (const k of ["light", "medium", "heavy"] as const) trained.add(k);
    }
    if (/\blight\b/.test(text)) trained.add("light");
    if (/\bmedium\b/.test(text)) trained.add("medium");
    if (/\bheavy\b/.test(text)) trained.add("heavy");
    if (/\bshields?\b/.test(text)) trained.add("shield");
  }
  return trained;
}
