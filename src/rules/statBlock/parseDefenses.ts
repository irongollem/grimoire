/**
 * Resistances, immunities and vulnerabilities as data (#1017).
 *
 * The grammar is that of `parseDamageGroups` in `src/lib/damageIcons.ts`: split on
 * ";" (D&D separates an unconditional list from a qualified one that way), and
 * because a "nonmagical" qualifier only ever applies to bludgeoning, piercing and
 * slashing, split a mixed group so the elemental types stay unconditional even
 * when the source leaves out the semicolon. Ported rather than imported: that
 * module uses `@/` imports, and this folder runs in edge functions.
 */
import { DAMAGE_TYPES, type DamageType } from "../../types/damage.types.ts";
import {
  type DamageDefense,
  type DefenseBypass,
  type Defenses,
  SRD_CONDITION_NAMES,
  type SrdConditionName,
  emptyDefenses,
} from "../../types/statBlock.types.ts";
import { CONDITION_STEMS } from "./vocab.ts";

const PHYSICAL: DamageType[] = ["bludgeoning", "piercing", "slashing"];

export interface DefenseInput {
  damage_resistances?: string | null;
  damage_immunities?: string | null;
  damage_vulnerabilities?: string | null;
  condition_immunities?: string | null;
}

/** Imported fields carry "&amp;" and the literal string "false" where a value is absent. */
function cleanSource(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  const text = raw.replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
  return text.toLowerCase() === "false" ? "" : text;
}

/** Qualifier text -> bypasses it names, plus whatever words are left over as a note. */
function readQualifier(rest: string): { unless: DefenseBypass[]; note: string | null } {
  const lower = rest.toLowerCase();
  const unless: DefenseBypass[] = [];
  let left = lower;
  if (/non[\s-]?magic/.test(lower)) {
    unless.push("magical");
    left = left.replace(/non[\s-]?magic(?:al)?\b/g, " ");
  }
  if (/(?:non[\s-]?|not made (?:with|of|from) |not |w\/\s*)silver/.test(lower) || /silvered/.test(lower)) {
    if (/non[\s-]?silver|not made (?:with|of|from) silver|not silver|w\/\s*silver|aren'?t silver/.test(lower)) {
      unless.push("silvered");
      left = left.replace(/non[\s-]?silver(?:ed)?|(?:not made (?:with|of|from)|not|w\/)\s*silver(?:ed)?/g, " ");
    }
  }
  if (/non[\s-]?adamant|not made (?:with|of|from) adamant|not adamant|w\/\s*adamant|aren'?t adamant/.test(lower)) {
    unless.push("adamantine");
    left = left.replace(/non[\s-]?adamant(?:ine)?|(?:not made (?:with|of|from)|not|w\/)\s*adamantine?/g, " ");
  }
  for (const metal of ["silvered", "adamantine"] as const) {
    if (unless.includes(metal)) left = left.replace(new RegExp(`\\b(?:silver(?:ed)?|adamant(?:ine)?)\\b`, "g"), " ");
  }
  // Words that only connect the qualifier to the types, or restate "nonmagical".
  left = left
    .replace(/\b(?:b\/p\/s|from|that|which|is|are|aren'?t|isn'?t|not|made|with|and|or|attacks?|weapons?|damage|nonmagic)\b/g, " ")
    .replace(/&/g, " ")
    .replace(/[,;()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { unless, note: left.length > 0 ? left : null };
}

function order(types: DamageType[]): DamageType[] {
  return DAMAGE_TYPES.filter((t) => types.includes(t));
}

/** Parse one damage field into groups; segments that name no damage type go to `leftovers`. */
function parseDamageField(raw: string | null | undefined, leftovers: string[]): DamageDefense[] {
  const text = cleanSource(raw);
  if (!text) return [];
  const groups: DamageDefense[] = [];
  for (const segment of text.split(";")) {
    const trimmed = segment.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    const named = DAMAGE_TYPES.filter((t) => new RegExp(`\\b${t}\\b`).test(lower));
    // "B/P/S" and a bare "damage from nonmagical weapons" both mean the three physical types.
    const impliesPhysical = /\bb\/p\/s\b/.test(lower) || (named.length === 0 && /non[\s-]?magic/.test(lower));
    const types = impliesPhysical ? DAMAGE_TYPES.filter((t) => named.includes(t) || PHYSICAL.includes(t)) : named;
    if (types.length === 0) {
      leftovers.push(trimmed);
      continue;
    }
    let rest = lower;
    for (const t of DAMAGE_TYPES) rest = rest.replace(new RegExp(`\\b${t}\\b`, "g"), " ");
    const { unless, note } = readQualifier(rest);

    const physical = types.filter((t) => PHYSICAL.includes(t));
    const elemental = types.filter((t) => !PHYSICAL.includes(t));
    const make = (list: DamageType[], bypass: DefenseBypass[], withNote: string | null): DamageDefense => ({
      types: order(list),
      ...(bypass.length > 0 ? { unless: bypass } : {}),
      ...(withNote ? { note: withNote } : {}),
    });
    if (unless.includes("magical") && physical.length > 0 && elemental.length > 0) {
      groups.push(make(elemental, [], null));
      groups.push(make(physical, unless, note));
    } else {
      groups.push(make(types, unless, note));
    }
  }
  return groups;
}

/** The SRD condition a piece of an immunity field names, if any. */
function conditionIn(word: string): SrdConditionName | undefined {
  // "paralysis" shares no stem with "paralyzed" past "paraly"; checked first so
  // the stem table's order cannot hand it to another condition.
  if (/^paralysis$/i.test(word)) return "Paralyzed";
  return SRD_CONDITION_NAMES.find((n) => CONDITION_STEMS[n].test(word));
}

/**
 * What a piece says beyond its condition word, once filler ("the poisoned
 * condition") is gone. Non-empty means the immunity is qualified ("poisoned
 * (while Assassinate is active)", "frightened while raging").
 */
function qualifierOf(word: string, name: SrdConditionName): string {
  return word
    .replace(new RegExp(`(?:${CONDITION_STEMS[name].source})[a-z]*`, "i"), " ")
    .replace(/\bparalysis\b/i, " ")
    .replace(/\b(the|conditions?)\b/gi, " ")
    .replace(/[^a-z]+/gi, " ")
    .trim();
}

/** Every word a bare condition ("prone poisoned"): those conditions; otherwise none. */
function bareConditionRun(piece: string): SrdConditionName[] {
  const names: SrdConditionName[] = [];
  for (const word of piece.split(/\s+/)) {
    const name = conditionIn(word);
    if (name === undefined || qualifierOf(word, name) !== "") return [];
    names.push(name);
  }
  return names;
}

/**
 * Condition words in an immunity field -> SRD names; anything else is a leftover.
 * A qualified immunity is a leftover too, kept whole as a note: the runner treats
 * a typed condition immunity as absolute (a failed save never imposes it), which
 * is wrong for one that holds only sometimes, and the qualifier must survive.
 */
function parseConditions(raw: string | null | undefined, leftovers: string[]): SrdConditionName[] {
  const text = cleanSource(raw);
  if (!text) return [];
  const found: SrdConditionName[] = [];
  for (const piece of text.split(/[;,]|\band\b/i)) {
    const word = piece.trim();
    if (!word) continue;
    const name = conditionIn(word);
    // A run of bare condition words with a comma missing ("prone poisoned") is
    // each of them; anything else beside a condition word qualifies it.
    const names =
      name === undefined
        ? []
        : qualifierOf(word, name) === ""
          ? [name]
          : bareConditionRun(word);
    if (names.length === 0) {
      leftovers.push(word);
      continue;
    }
    for (const n of names) if (!found.includes(n)) found.push(n);
  }
  return found;
}

/**
 * A condition filed under damage immunities ("poison,poisoned", a common import
 * slip) is still that creature's condition immunity: lift single condition words
 * out of the comma list before the damage grammar sees them.
 */
function pullConditionWords(raw: string | null | undefined, into: SrdConditionName[]): string {
  const text = cleanSource(raw);
  if (!text) return "";
  return text
    .split(";")
    .map((segment) =>
      segment
        .split(",")
        .filter((piece) => {
          const word = piece.trim();
          const name = SRD_CONDITION_NAMES.find((n) => new RegExp(`^${CONDITION_STEMS[n].source}[a-z]*$`, "i").test(word) && !DAMAGE_TYPES.some((t) => t === word.toLowerCase()));
          if (name === undefined) return true;
          if (!into.includes(name)) into.push(name);
          return false;
        })
        .join(","),
    )
    .filter((segment) => segment.trim().length > 0)
    .join(";");
}

export function parseDefenses(input: DefenseInput): Defenses {
  const defenses = emptyDefenses();
  const notes: string[] = [];

  const resistanceLeft: string[] = [];
  const immunityLeft: string[] = [];
  const misfiled: SrdConditionName[] = [];
  const vulnerabilityLeft: string[] = [];
  defenses.resistances = parseDamageField(input.damage_resistances, resistanceLeft);
  defenses.immunities = parseDamageField(pullConditionWords(input.damage_immunities, misfiled), immunityLeft);
  defenses.vulnerabilities = parseDamageField(input.damage_vulnerabilities, vulnerabilityLeft);

  const conditionLeft: string[] = [];
  defenses.condition_immunities = parseConditions(input.condition_immunities, conditionLeft);
  for (const name of misfiled) if (!defenses.condition_immunities.includes(name)) defenses.condition_immunities.push(name);

  notes.push(...resistanceLeft, ...immunityLeft, ...vulnerabilityLeft, ...conditionLeft);
  if (notes.length > 0) defenses.notes = notes.join("; ");
  return defenses;
}

function joinTypes(types: DamageType[], oxford: boolean): string {
  if (!oxford || types.length < 3) return types.length === 2 && oxford ? `${types[0]} and ${types[1]}` : types.join(", ");
  return `${types.slice(0, -1).join(", ")}, and ${types[types.length - 1]}`;
}

function bypassText(unless: DefenseBypass[] | undefined): string {
  if (!unless || unless.length === 0) return "";
  const parts: string[] = [];
  if (unless.includes("magical")) parts.push("from nonmagical attacks");
  const metals = unless.filter((u) => u !== "magical");
  if (metals.length > 0) parts.push(`that aren't ${metals.join(" or ")}`);
  return ` ${parts.join(" ")}`;
}

/**
 * 2014-style display text: "fire, poison; bludgeoning, piercing, and slashing from
 * nonmagical attacks that aren't silvered". Unconditional groups come first.
 */
export function formatDefenseList(list: DamageDefense[]): string {
  const sorted = [...list].sort((a, b) => Number(Boolean(a.unless?.length)) - Number(Boolean(b.unless?.length)));
  return sorted
    .map((g) => {
      const qualified = Boolean(g.unless?.length);
      const note = g.note ? ` (${g.note})` : "";
      return `${joinTypes(g.types, qualified)}${bypassText(g.unless)}${note}`;
    })
    .join("; ");
}

export function formatConditionImmunities(list: SrdConditionName[]): string {
  return list.map((c) => c.toLowerCase()).join(", ");
}
