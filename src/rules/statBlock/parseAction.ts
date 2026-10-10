/**
 * The deterministic stat-block parser (#1017): prose in, `ActionStructure` out.
 *
 * Precision over recall. A wrong structure puts a wrong roll button on the DM's
 * screen, while `kind: "other"` only costs them a button, so anything not read
 * with confidence becomes "other". An entry that shows a cue (a to-hit bonus, a
 * DC, a saving throw) but could not be read in full carries a `review` reason:
 * those entries are the backlog for agent extraction.
 */
import type { ActionStructure, AttackStructure, SaveStructure } from "../../types/statBlock.types.ts";
import { readDamage, sentenceEnd } from "./damageParts.ts";
import { parseNameMarkers } from "./nameMarkers.ts";
import { parseMultiattack } from "./parseMultiattack.ts";
import { parseOptions } from "./parseOptions.ts";
import { buildSave, findSaves } from "./parseSave.ts";
import { entryMatchText } from "./proseText.ts";

export type StatBlockListKey =
  | "special_abilities"
  | "actions"
  | "bonus_actions"
  | "reactions"
  | "legendary_actions"
  | "lair_actions";

export interface EntryContext {
  list: StatBlockListKey;
  /** Printed names of every entry in the same stat block, across all lists. */
  siblings: string[];
}

const ATTACK_HEADER =
  /\b(Melee or Ranged|Melee|Ranged)(?:\s+(?:Weapon|Spell|Magical|Magic))?\s+Attack(?:\s+Roll)?[:.]\s*([+-]\d+)(?:\s+to hit)?/gi;

/** The prose with the DCs and bonuses that are not an attack or save of this entry blanked out. */
function cueText(text: string): string {
  return text
    .replace(/\b(?:spell )?save DC\s*\d+/gi, " ")
    .replace(/\bability checks?\s*\(DC[^)]*\)/gi, " ")
    .replace(/\bescape DC\s*\d+/gi, " ")
    .replace(/\bDC\s*\d+\s+\w+(?:\s+or\s+\w+)?\s+(?:\([^)]*\)\s*)?checks?\b/gi, " ")
    .replace(/\bDC of\b/gi, " ")
    .replace(/[+-]\d+\s+to hit with spell attacks?/gi, " ");
}

/** True when the prose shows an attack or save cue, so a failure to read it is worth a review. */
function hasCue(text: string): boolean {
  const t = cueText(text);
  return (
    /\bto hit\b/i.test(t) ||
    /\b(?:Melee|Ranged|Weapon|Spell)(?:\s+or\s+\w+)?(?:\s+(?:Weapon|Spell))?\s+Attack(?:\s+Roll)?:/i.test(t) ||
    /\bDC\s*\d+/i.test(t)
  );
}

function reach(afterHeader: string, delivery: AttackStructure["delivery"]): Pick<AttackStructure, "reach" | "range"> {
  const out: Pick<AttackStructure, "reach" | "range"> = {};
  const head = afterHeader.slice(0, 160);
  const explicitReach = /\breach\s+(\d+)\s*ft/i.exec(head);
  const explicitRange = /\brange\s+(\d+)(?:\s*\/\s*(\d+))?\s*ft/i.exec(head);
  if (explicitReach) out.reach = Number(explicitReach[1]);
  if (explicitRange) {
    out.range = explicitRange[2] === undefined
      ? { normal: Number(explicitRange[1]) }
      : { normal: Number(explicitRange[1]), long: Number(explicitRange[2]) };
  }
  if (!explicitReach && !explicitRange && delivery !== "melee_or_ranged") {
    // Terse Tome of Beasts: "+7 to hit, 5 ft., one target" / "+7 to hit, 80/320 ft., one target"
    const bare = /^[,\s]*(\d+)(?:\s*\/\s*(\d+))?\s*ft\b/i.exec(head.replace(/^\s*,?\s*(?:to hit)?/i, ""));
    if (bare) {
      if (delivery === "melee") out.reach = Number(bare[1]);
      else out.range = bare[2] === undefined ? { normal: Number(bare[1]) } : { normal: Number(bare[1]), long: Number(bare[2]) };
    }
  }
  return out;
}

type Outcome = { structure: AttackStructure; end: number } | { review: string };

function parseAttack(text: string, header: RegExpExecArray): Outcome {
  const deliveryWord = header[1].toLowerCase();
  const delivery: AttackStructure["delivery"] =
    deliveryWord === "melee" ? "melee" : deliveryWord === "ranged" ? "ranged" : "melee_or_ranged";
  const afterHeader = header.index + header[0].length;

  const hit = /\bHit:/i.exec(text.slice(afterHeader));
  const start = hit ? afterHeader + hit.index + hit[0].length : afterHeader;
  const limit = sentenceEnd(text, start);
  const damage = readDamage(text, start, limit);
  const shape = { delivery, bonus: Number(header[2]), ...reach(text.slice(afterHeader), delivery) };
  // No damage in the hit ("Hit: The target is grappled"): the attack still rolls to hit, the effect stays prose.
  if (!damage) return { structure: { ...shape, hit: [] }, end: start };
  // "Hit: The target must make a DC 15 Constitution saving throw, taking 45 (10d8) ...": that damage is the
  // save's, so the attack hits for nothing of its own and the save carries the damage.
  if (findSaves(text.slice(0, damage.start), start).length > 0) return { structure: { ...shape, hit: [] }, end: start };
  if (damage.choice) return { review: "unparsed: damage type is a choice" };
  return { structure: { ...shape, hit: damage.parts }, end: damage.end };
}

function plain(markers: ReturnType<typeof parseNameMarkers>, review?: string): ActionStructure {
  return { kind: "other", ...markers, source: "parsed", ...(review === undefined ? {} : { review }) };
}

export function parseActionProse(entry: { name: string; description: string }, ctx: EntryContext): ActionStructure {
  const markers = parseNameMarkers(entry.name, ctx.list === "legendary_actions");
  const text = entryMatchText(entry.description);

  /** A menu entry: each headed section is read as its own entry; recharge, uses and cost stay on this one. */
  const asOptions = (fallback: string): ActionStructure => {
    const result = parseOptions(
      entry.description,
      (section) => parseActionProse({ name: section.name, description: section.body }, { list: "actions", siblings: ctx.siblings }),
      hasCue,
    );
    if ("reason" in result) return plain(markers, result.reason.endsWith("several options in one entry") ? fallback : result.reason);
    return { kind: "options", options: result.structure, ...markers, source: "parsed" };
  };

  if (/^multiattack\b/i.test(entry.name.trim())) {
    return { kind: "multiattack", ...markers, multiattack: parseMultiattack(text, ctx.siblings), source: "parsed" };
  }
  if (/\bspellcasting\b/i.test(entry.name)) return plain(markers);

  // A menu of effects ("one of the following") is several entries in one; only a person can split it.
  if (/\b(?:one|two) of the following\b|\bchoos(?:es|ing)\s+(?:one of|from)\b|\bfrom the following\b/i.test(text) && hasCue(text)) {
    return asOptions("unparsed: several options in one entry");
  }

  // Several headed sections that each state the same save ("**Cold Breath.** ... DC 17 Constitution") are options too.
  const sections = (entry.description.match(/^\s*(?:\*\*|[-*\u2022]\s)/gm) ?? []).length;
  const optionMenu = sections >= 2;

  // "40 (9d8) damage of the corresponding type": the type is picked elsewhere (a colour, a form), not stated.
  if (/\bdamage of (?:the|a|that|one)\b[^.]{0,30}\btype\b|\bof the (?:corresponding|chosen) type\b/i.test(text) && hasCue(text)) {
    return plain(markers, "unparsed: damage type not named");
  }

  const headers = [...text.matchAll(ATTACK_HEADER)];
  if (headers.length > 1) return asOptions("unparsed: several attacks in one entry");

  if (headers.length === 1) {
    const outcome = parseAttack(text, headers[0]);
    if ("review" in outcome) return plain(markers, outcome.review);
    const saves = findSaves(text, outcome.end);
    if (optionMenu && saves.length > 0 && saves[0].mentions > 1) return asOptions("unparsed: several options in one entry");
    if (saves.length > 1) return plain(markers, "unparsed: attack with several saves");
    const save: SaveStructure | null = saves[0] ? buildSave(text, saves[0], outcome.end) : null;
    if (saves[0] && !save) return plain(markers, "unparsed: damage type is a choice");
    return {
      kind: "attack",
      attack: outcome.structure,
      ...(save ? { save } : {}),
      ...markers,
      source: "parsed",
    };
  }

  const saves = findSaves(text);
  if (optionMenu && saves.length > 0 && saves[0].mentions > 1) return asOptions("unparsed: several options in one entry");
  if (saves.length === 1) {
    const save = buildSave(text, saves[0]);
    if (!save) return plain(markers, "unparsed: damage type is a choice");
    return { kind: "save", save, ...markers, source: "parsed" };
  }
  if (saves.length > 1) return asOptions("unparsed: several saves in one entry");

  if (!hasCue(text)) return plain(markers);
  if (/\bto hit\b|\bAttack(?:\s+Roll)?:/i.test(cueText(text))) return plain(markers, "unparsed: attack cue without a readable attack line");
  return plain(markers, "unparsed: save ability not found");
}
