/**
 * The weapons a class may take Weapon Mastery in (2024): the ones it is
 * proficient with that carry a mastery property. The class lists its
 * proficiencies as prose ("Simple weapons, Martial weapons that have the Light
 * property"), so the prose is read here and nowhere else.
 */

export interface MasteryWeapon {
  id: string;
  name: string;
  /** "Simple Melee Weapons", "Martial Ranged Weapons". */
  subtype: string | null;
  /** Weapon properties as slugs ("finesse", "light"). */
  properties: string[];
}

/** The property names a proficiency line narrows martial weapons to, e.g. ["finesse", "light"]. */
function martialLimit(line: string): string[] | null {
  const match = /martial weapons?\s+(?:that|which)\s+(?:have|has|with)\s+the\s+([^.;]*?)\s+propert/i.exec(line);
  if (!match) return null;
  return match[1]
    .toLowerCase()
    .split(/\s+or\s+|\s*,\s*|\s+and\s+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

export function weaponAllowed(proficiencies: readonly string[], weapon: MasteryWeapon): boolean {
  const subtype = (weapon.subtype ?? "").toLowerCase();
  const simple = subtype.startsWith("simple");
  const martial = subtype.startsWith("martial");
  for (const line of proficiencies) {
    const text = line.toLowerCase();
    if (simple && /simple/.test(text)) return true;
    if (martial && /martial/.test(text)) {
      const limit = martialLimit(line);
      if (limit === null) return true;
      if (weapon.properties.some((p) => limit.includes(p.toLowerCase()))) return true;
    }
  }
  return false;
}

/** One entry per weapon name (the library holds an item per source), sorted by name. */
export function masteryWeaponsFor(
  weapons: readonly MasteryWeapon[],
  proficiencies: readonly string[],
): MasteryWeapon[] {
  const byName = new Map<string, MasteryWeapon>();
  for (const w of weapons) if (!byName.has(w.name) && weaponAllowed(proficiencies, w)) byName.set(w.name, w);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}
