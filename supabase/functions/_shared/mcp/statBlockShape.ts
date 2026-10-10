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
// A client may send either form (#1017): the prose form (the four modifier
// strings, entries of {name, description}) or the stored form a `get` returned
// (a `defenses` object, entries that also carry `structured`). This file only
// proves the shape is structurally sound; whether a structure is *true* to its
// prose is the parser's prose check, run by `structureStatBlock` on write.
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

const ACTION_KINDS = ["attack", "save", "multiattack", "other"];
const ACTION_SOURCES = ["parsed", "extracted", "manual"];
const DEFENSE_LISTS = ["resistances", "immunities", "vulnerabilities"] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isStringArray(v: unknown): boolean {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

/** Structural check of a stored `defenses` object; null when it conforms. */
function defensesProblem(d: unknown): string | null {
  if (!isRecord(d)) return `defenses must be an object, not ${kindOf(d)}.`;
  for (const key of DEFENSE_LISTS) {
    const list = d[key];
    if (!Array.isArray(list)) return `defenses.${key} must be an array, not ${kindOf(list)}.`;
    const bad = list.findIndex((e) => !isRecord(e) || !isStringArray(e.types));
    if (bad !== -1) return `defenses.${key}[${bad}] must be {types: string[]}.`;
  }
  if (!isStringArray(d.condition_immunities)) return "defenses.condition_immunities must be an array of strings.";
  if ("notes" in d && typeof d.notes !== "string") return "defenses.notes must be a string.";
  return null;
}

/** Structural check of an entry's stored `structured` payload; null when it conforms. */
function structuredProblem(s: unknown): string | null {
  if (!isRecord(s)) return `must be an object, not ${kindOf(s)}.`;
  if (typeof s.kind !== "string" || !ACTION_KINDS.includes(s.kind)) {
    return `kind must be one of: ${ACTION_KINDS.join(", ")}.`;
  }
  if (typeof s.source !== "string" || !ACTION_SOURCES.includes(s.source)) {
    return `source must be one of: ${ACTION_SOURCES.join(", ")}.`;
  }
  for (const key of ["attack", "save", "recharge", "uses"]) {
    if (key in s && !isRecord(s[key])) return `${key} must be an object, not ${kindOf(s[key])}.`;
  }
  if ("multiattack" in s && !Array.isArray(s.multiattack)) return "multiattack must be an array.";
  if ("legendary_cost" in s && typeof s.legendary_cost !== "number") return "legendary_cost must be a number.";
  return null;
}

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
    for (const [i, e] of list.entries()) {
      const entry = e as Record<string, unknown>;
      if (entry.structured === undefined) continue;
      const problem = structuredProblem(entry.structured);
      if (problem) return `${key}[${i}].structured ${problem}`;
    }
  }
  if ("defenses" in block) {
    const problem = defensesProblem(block.defenses);
    if (problem) return problem;
  }
  return null;
}
