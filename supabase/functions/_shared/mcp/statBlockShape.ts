// Leaf-level check for a monster `stat_block` written over MCP.
//
// The generic `json` coercion only proves the payload is an object. That is not
// enough here: every reader (`StatBlockPanel`, the encounter runner's
// `parseSaveString`, Cardforge, Scriptorium) treats `saving_throws` and the
// resistance/immunity lines as *strings* and calls `.split` on them. An agent
// reaching for the Open5e / 5e-API convention sends `{"Dexterity": 6}` and
// `["charmed"]` instead — valid JSON, a crash on the monster page. One such row
// took `StatBlockPanel` down on 25 Sep 2026, so the shape of `MonsterStatBlock`
// (src/types/monster.types.ts) is enforced at the door rather than tolerated by
// every reader.
//
// Presence is not checked — a name-only stub is a legitimate monster — only the
// type of each key that is sent.

const STRING_KEYS: Record<string, string> = {
  hit_points: '"8d8+16"',
  speed: '"30 ft., fly 60 ft."',
  challenge_rating: '"5" or "1/2"',
  saving_throws: '"Dex +6, Wis +3"',
  damage_vulnerabilities: '"fire, cold"',
  damage_resistances: '"fire, cold"',
  damage_immunities: '"poison"',
  condition_immunities: '"charmed, frightened"',
  senses: '"darkvision 60 ft., passive Perception 14"',
  languages: '"Common, Elvish"',
};

const NUMBER_KEYS = [
  "armor_class",
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha",
  "proficiency_bonus",
  "legendary_resistance",
];

const ENTRY_LIST_KEYS = [
  "special_abilities",
  "actions",
  "bonus_actions",
  "reactions",
  "legendary_actions",
  "lair_actions",
];

function kindOf(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "an array";
  return typeof v === "object" ? "an object" : `a ${typeof v}`;
}

/** The first shape violation in a monster stat block, or null when it conforms. */
export function monsterStatBlockProblem(sb: object): string | null {
  if (Array.isArray(sb)) return "stat_block must be an object, not an array.";
  const block = sb as Record<string, unknown>;

  for (const [key, example] of Object.entries(STRING_KEYS)) {
    if (key in block && typeof block[key] !== "string") {
      return `${key} must be a string like ${example}, not ${kindOf(block[key])}.`;
    }
  }
  for (const key of NUMBER_KEYS) {
    if (key in block && typeof block[key] !== "number") {
      return `${key} must be a number, not ${kindOf(block[key])}.`;
    }
  }
  if ("initiative_bonus" in block && block.initiative_bonus !== null && typeof block.initiative_bonus !== "number") {
    return `initiative_bonus must be a number or null, not ${kindOf(block.initiative_bonus)}.`;
  }
  if ("skills" in block) {
    const skills = block.skills;
    if (typeof skills !== "object" || skills === null || Array.isArray(skills)) {
      return `skills must be an object like {"perception": "+3"}, not ${kindOf(skills)}.`;
    }
    for (const [name, bonus] of Object.entries(skills)) {
      if (typeof bonus !== "string") {
        return `skills.${name} must be a string like "+3", not ${kindOf(bonus)}.`;
      }
    }
  }
  for (const key of ENTRY_LIST_KEYS) {
    if (!(key in block)) continue;
    const list = block[key];
    if (!Array.isArray(list)) return `${key} must be an array of {name, description}, not ${kindOf(list)}.`;
    const bad = list.findIndex(
      (e) =>
        typeof e !== "object" || e === null ||
        typeof (e as Record<string, unknown>).name !== "string" ||
        typeof (e as Record<string, unknown>).description !== "string",
    );
    if (bad !== -1) return `${key}[${bad}] must be {name, description} with string values.`;
  }
  return null;
}
