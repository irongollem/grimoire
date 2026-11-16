// Reads the prose of a "Spellcasting" or "Innate Spellcasting" stat-block entry into its header facts and its spell
// lists (#1021). The prose is the only place a monster's spells live, so everything that needs them reads it here.
//
// Pure and edge-importable (relative `.ts` imports only).
//
// Out of scope: a one-liner such as "The creature can innately cast fireball once" names a spell with no marker line,
// so it gives `groups: []`. Nothing in the library's marker formats below is lost by that.

import type { MonsterStatBlock } from "../../types/monster.types.ts";
import type { StatBlockEntry } from "../../types/statBlock.types.ts";
import { entryPlainText } from "./proseText.ts";

export type SpellFrequency =
  | { kind: "at_will" }
  | { kind: "per_day"; count: number; each: boolean }
  | { kind: "slots"; level: number; slots: number }
  | { kind: "cantrips" };

export interface ProseSpell {
  /** As printed, without markdown, trimmed: "plane shift". */
  name: string;
  /** What followed in parentheses, without them: "self only"; null when none. */
  qualifier: string | null;
  /** Lower case, single spaces: the form a spell record is looked up by. */
  key: string;
}

export interface ProseSpellGroup {
  frequency: SpellFrequency;
  spells: ProseSpell[];
}

export interface SpellcastingProse {
  innate: boolean;
  ability: "INT" | "WIS" | "CHA" | null;
  saveDc: number | null;
  attackBonus: number | null;
  casterLevel: number | null;
  className: string | null;
  groups: ProseSpellGroup[];
}

type StatBlockList = "special_abilities" | "actions" | "bonus_actions";

/**
 * Where a spell group starts. Formats seen in the library:
 *   SRD 5.1, mage:      "Cantrips (at will):", "1st level (4 slots):", "5th level (1 slot):"
 *   SRD 5.1, night hag: "At will:", "2/day each:"
 *   SRD 5.2, night hag: "At Will:", "2/Day Each:" (after a markdown bullet)
 */
const MARKER =
  /\b(cantrips\s*\(\s*at will\s*\)|at will|(\d+)\s*\/\s*day(\s+ea(?:ch)?\.?)?|(\d+)(?:st|nd|rd|th)\s+level\s*\(\s*(\d+)\s+slots?\s*\))\s*:/gi;

const NAME_WORDS = new Set(["spellcasting", "innate spellcasting"]);

/**
 * An entry is a spellcasting entry by its name alone: "Spellcasting" or "Innate Spellcasting", with a trailing
 * parenthetical such as "(Psionics)" allowed. "Shared Spellcasting (Coven Only)", "Detect Spellcasting" and
 * "Spellcasting Animosity" are other traits that merely mention the word, and carry no spell list of the creature's own.
 */
export function isSpellcastingEntry(entry: StatBlockEntry): boolean {
  const bare = entry.name.replace(/\s*\([^()]*\)\s*$/, "").replace(/\s+/g, " ").trim().toLowerCase();
  return NAME_WORDS.has(bare);
}

const ABILITIES: Readonly<Record<string, "INT" | "WIS" | "CHA">> = {
  intelligence: "INT",
  wisdom: "WIS",
  charisma: "CHA",
};

function abilityIn(text: string): SpellcastingProse["ability"] {
  const word = /spellcasting ability is (\w+)/i.exec(text)?.[1] ?? /using (\w+) as the spellcasting ability/i.exec(text)?.[1];
  if (word === undefined) return null;
  const key = word.toLowerCase();
  return Object.hasOwn(ABILITIES, key) ? ABILITIES[key] : null;
}

function numberIn(text: string, pattern: RegExp): number | null {
  const found = pattern.exec(text)?.[1];
  return found === undefined ? null : Number(found);
}

function classIn(text: string): string | null {
  const found = /following (\w+) spells (?:prepared|known)/i.exec(text)?.[1] ?? /(\w+) spells known/i.exec(text)?.[1];
  return found === undefined ? null : found.toLowerCase();
}

/** Split on commas that are not inside parentheses: "conjure elemental (fire elemental only), fire shield" is two. */
function splitSpells(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    else if (ch === ")" && depth > 0) depth--;
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts;
}

function spellFrom(raw: string): ProseSpell | null {
  const text = raw.trim().replace(/[.;]+$/, "").trim();
  const paren = /^(.*?)\s*\(([^()]*)\)$/.exec(text);
  const name = (paren === null ? text : paren[1]).trim();
  if (name === "") return null;
  const qualifier = paren === null ? null : paren[2].trim();
  return { name, qualifier: qualifier === "" ? null : qualifier, key: name.replace(/\s+/g, " ").toLowerCase() };
}

function frequencyOf(mark: RegExpMatchArray): SpellFrequency {
  if (mark[2] !== undefined) return { kind: "per_day", count: Number(mark[2]), each: mark[3] !== undefined };
  if (mark[4] !== undefined) return { kind: "slots", level: Number(mark[4]), slots: Number(mark[5]) };
  return /cantrips/i.test(mark[1]) ? { kind: "cantrips" } : { kind: "at_will" };
}

function groupsIn(lines: readonly string[]): ProseSpellGroup[] {
  const groups: ProseSpellGroup[] = [];
  for (const text of lines) {
    const marks = [...text.matchAll(MARKER)];
    marks.forEach((mark, i) => {
      // `matchAll` always sets the index; the type only allows for a match made some other way.
      const at = mark.index;
      if (at === undefined) return;
      const start = at + mark[0].length;
      const next = i + 1 < marks.length ? marks[i + 1].index : undefined;
      const end = next === undefined ? text.length : next;
      const spells = splitSpells(text.slice(start, end))
        .map(spellFrom)
        .filter((s): s is ProseSpell => s !== null);
      groups.push({ frequency: frequencyOf(mark), spells });
    });
  }
  return groups;
}

/** The entry's header facts and spell groups; null when the entry is not a spellcasting entry. */
export function parseSpellcasting(entry: StatBlockEntry): SpellcastingProse | null {
  if (!isSpellcastingEntry(entry)) return null;
  // Markdown emphasis and a leading bullet would split a marker from its colon or glue a dash to a spell name.
  // Some books keep a literal `<br>` between lines and a bullet dot between groups; both end a line here, or the
  // tag would be read as part of the last spell's name ("hold<br>").
  const lines = entryPlainText(entry.description)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\s•\s/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[*_]/g, "").replace(/^\s*[-•]\s+/, "").trim());
  const flat = lines.join(" ");
  const innateName = entry.name.toLowerCase().includes("innate");
  return {
    innate: innateName || /innately cast|innate spellcasting ability/i.test(flat),
    ability: abilityIn(flat),
    saveDc: numberIn(flat, /spell save DC (\d+)/i),
    attackBonus: numberIn(flat, /\+(\d+) to hit with spell attacks/i),
    casterLevel: numberIn(flat, /(\d+)(?:st|nd|rd|th)-level spellcaster/i),
    className: classIn(flat),
    groups: groupsIn(lines),
  };
}

/** Every spellcasting entry of a stat block, with the list it sits in (2014 puts it in traits, 2024 in actions). */
export function spellcastingOf(
  statBlock: MonsterStatBlock,
): { list: StatBlockList; entry: StatBlockEntry; prose: SpellcastingProse }[] {
  const found: { list: StatBlockList; entry: StatBlockEntry; prose: SpellcastingProse }[] = [];
  const lists: StatBlockList[] = ["special_abilities", "actions", "bonus_actions"];
  for (const list of lists) {
    for (const entry of statBlock[list] ?? []) {
      const prose = parseSpellcasting(entry);
      if (prose !== null) found.push({ list, entry, prose });
    }
  }
  return found;
}
