/**
 * "Options" entries (#1017): "The dragon uses one of the following breath weapons.
 * **Fire Breath.** ... **Sleep Breath.** ..." Each headed section is read on its own
 * text, as an attack or a save, by the same parser a single entry goes through.
 *
 * A menu is all or nothing: one section that is not a complete attack or save, or
 * a roll stated once in the preamble for every section ("The target must succeed
 * on a DC 15 save or suffer the chosen effect"), and the whole entry stays prose.
 */
import type { ActionOption, ActionStructure } from "../../types/statBlock.types.ts";
import { entryPlainText, normalizeForMatch } from "./proseText.ts";

export interface Section {
  name: string;
  body: string;
}

export interface SplitEntry {
  preamble: string;
  sections: Section[];
}

const SMALL_WORDS = new Set(["of", "the", "a", "an", "and", "in", "to", "for", "on", "or", "with", "from"]);
const HEADING = /^([A-Z][A-Za-z'()\- ]{1,48}?)\s*[.:]\s*(.*)$/;
/** "Grabbing Claw Melee Weapon Attack: +5 to hit": the attack header belongs to the body, not the name. */
const ATTACK_TAIL = /^(.*?)\s*((?:Melee or Ranged|Melee|Ranged)(?: Weapon| Spell)? Attack(?: Roll)?)$/;

function isTitleCase(name: string): boolean {
  const words = name.replace(/\([^)]*\)/g, " ").split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 7) return false;
  return words.every((w) => /^[A-Z]/.test(w) || SMALL_WORDS.has(w.toLowerCase()));
}

/** Split a description into a preamble and its headed sections (bold, bulleted, or run together). */
export function splitSections(description: string): SplitEntry {
  const lines = normalizeForMatch(entryPlainText(description))
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•]\s+/, "").replace(/[*_]+/g, "").trim())
    .join("\n")
    // Imported text sometimes runs sections together: "...ending effect for it.Blinding Sand. Breathes..."
    .replace(/([.:])(?=[A-Z][a-z])/g, "$1\n")
    .split("\n")
    .filter((l) => l.length > 0);

  const preamble: string[] = [];
  const sections: Section[] = [];
  for (const line of lines) {
    const m = HEADING.exec(line);
    if (m && isTitleCase(m[1])) {
      // ToB 3 writes "Beckoning Finger Target: DC 14 Str save or...": the name is what comes before "Target".
      const name = m[1].replace(/\s+Target$/, "");
      const tail = ATTACK_TAIL.exec(name);
      sections.push(
        tail && tail[1]
          ? { name: tail[1].trim(), body: `${tail[2]}: ${m[2]}`.trim() }
          : { name: name.trim(), body: m[2].trim() },
      );
    } else if (sections.length > 0) {
      sections[sections.length - 1].body += ` ${line}`;
    } else {
      preamble.push(line);
    }
  }
  return { preamble: preamble.join(" "), sections };
}

export type OptionsResult = { structure: ActionStructure["options"] } | { reason: string };

/**
 * `parseSection` reads one section as a stand-alone entry (the caller's own
 * single-entry parser), and `hasCue` says whether the preamble carries a roll.
 */
export function parseOptions(
  description: string,
  parseSection: (section: Section) => ActionStructure,
  hasCue: (text: string) => boolean,
): OptionsResult {
  const { preamble, sections } = splitSections(description);
  if (sections.length < 2) return { reason: "unparsed: several options in one entry" };
  if (hasCue(preamble)) return { reason: "unparsed: options share a roll stated once" };

  const options: ActionOption[] = [];
  const seen = new Set<string>();
  for (const section of sections) {
    const key = section.name.toLowerCase();
    if (seen.has(key)) return { reason: "unparsed: options with repeated names" };
    seen.add(key);
    const parsed = parseSection(section);
    // A damage roll with no type ("36 (8d8) damage", the types chosen elsewhere) is not a complete option.
    const untyped = [...(parsed.attack?.hit ?? []), ...(parsed.save?.fail ?? [])].some((p) => p.type === null);
    if (untyped) return { reason: `unparsed: option "${section.name}" has damage of no stated type` };
    if (parsed.kind === "attack" && parsed.attack) {
      options.push({ name: section.name, kind: "attack", attack: parsed.attack, ...(parsed.save ? { save: parsed.save } : {}) });
    } else if (parsed.kind === "save" && parsed.save) {
      options.push({ name: section.name, kind: "save", save: parsed.save });
    } else {
      return { reason: `unparsed: option "${section.name}" is not a readable attack or save` };
    }
  }
  return { structure: options };
}
