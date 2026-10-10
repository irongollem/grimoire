/**
 * Saving throws in stat-block prose (#1017), in the phrasings the library uses:
 *  2014   "must make a DC 13 Dexterity saving throw, taking 22 (4d10) fire damage
 *          on a failed save, or half as much damage on a successful one."
 *  2024   "Dexterity Saving Throw: DC 25, each creature ... Failure: 18 (4d8)
 *          Bludgeoning damage. Success: Half damage only."
 *  terse  "must make DC 11 Str save or take 5 (2d4) bludgeoning damage."
 */
import type { DamagePart, SaveAbility, SaveStructure, SrdConditionName } from "../../types/statBlock.types.ts";
import { SRD_CONDITION_NAMES } from "../../types/statBlock.types.ts";
import { readDamage, sentenceEnd } from "./damageParts.ts";
import { ABILITY_RE_SOURCE, CONDITION_STEMS, abilityFromWord } from "./vocab.ts";

const A = ABILITY_RE_SOURCE;
const DC_FIRST = new RegExp(`\\bDC\\s*(\\d+)\\s*,?\\s*${A}\\b(?:\\s*\\)?\\s*(?:saving throws?|saves?)\\b)`, "gi");
/** ToB 3 shorthand: "(DC 12 Str negates)", "(DC 15 Con half)". */
const PAREN = new RegExp(`\\(\\s*DC\\s*(\\d+)\\s*${A}\\b([^)]*)\\)`, "gi");
const SAVE_FIRST = new RegExp(`\\b${A}\\s+(?:saving throws?|saves?)\\s*[:(,]?\\s*(?:against\\s+)?(?:\\(\\s*)?DC\\s*(\\d+)`, "gi");

export interface SaveMatch {
  ability: SaveAbility;
  dc: number;
  /** Where the match starts and ends in the text. */
  index: number;
  end: number;
  /** The 2024 "Dexterity Saving Throw: DC 25" shape, whose outcome follows as "Failure: / Success:". */
  labelled: boolean;
  /** The ToB 3 "(DC 15 Con half)" shape, whose outcome is the clause before it. */
  paren: boolean;
  /** Text inside the shorthand parenthesis after the ability ("half", "negates"). */
  parenTail: string;
  /** How many times the same (ability, DC) save appears in the text. */
  mentions: number;
}

/** Every distinct (ability, dc) save in `text` at or after `from`, in order of appearance. */
export function findSaves(text: string, from = 0): SaveMatch[] {
  const found: SaveMatch[] = [];
  const add = (abilityWord: string, dc: string, index: number, end: number, saveFirst: boolean, parenTail?: string) => {
    const ability = abilityFromWord(abilityWord);
    if (!ability || index < from) return;
    const labelled =
      saveFirst && /^\s*(?:saving throws?|saves?)\s*:/i.test(text.slice(index + abilityWord.length));
    found.push({ ability, dc: Number(dc), index, end, labelled, paren: parenTail !== undefined, parenTail: parenTail ?? "", mentions: 1 });
  };
  for (const m of text.matchAll(DC_FIRST)) add(m[2], m[1], m.index, m.index + m[0].length, false);
  for (const m of text.matchAll(SAVE_FIRST)) add(m[1], m[2], m.index, m.index + m[0].length, true);
  for (const m of text.matchAll(PAREN)) if (!/\bchecks?\b/i.test(m[3])) add(m[2], m[1], m.index, m.index + m[0].length, false, m[3]);
  found.sort((x, y) => x.index - y.index);
  // The same save can match two patterns ("DC 13 Dex save" and "(DC 13 Dex save)"): keep the first.
  const merged = found.filter(
    (s, i) => !found.slice(0, i).some((p) => p.ability === s.ability && p.dc === s.dc && s.index < p.end + 2),
  );
  return collapseRestatements(merged);
}

/**
 * "...must succeed on a DC 15 Wisdom saving throw... if the target fails the DC 15
 * Wisdom saving throw by 5 or more" is one save said twice: keep the first and
 * count the mentions, so a caller can tell a restatement from a menu of options.
 */
function collapseRestatements(saves: SaveMatch[]): SaveMatch[] {
  const kept: SaveMatch[] = [];
  for (const s of saves) {
    const prior = kept.find((k) => k.ability === s.ability && k.dc === s.dc);
    if (prior) prior.mentions += 1;
    else kept.push(s);
  }
  return kept;
}

/** Words that open the sentence after a save and still describe its outcome. */
const OUTCOME_SENTENCE =
  /^(?:On a (?:failed save|failure|failed saving throw|success|successful save|successful saving throw)|A creature (?:that fails|takes|that fails the save)|A target (?:takes|that fails)|The target takes|Failure:|Failed save|Those who fail|Creatures that fail|On a success)/;

/** The text that describes what happens on a failed save, and where its sentence ends. */
function outcomeRegion(text: string, save: SaveMatch, floor: number): string {
  if (save.paren) {
    const before = text.slice(0, save.index);
    let cut = 0;
    for (const m of before.matchAll(/(?<!\b(?:ft|vs))\.\s+(?=[A-Z])|[:;]\s/g)) cut = m.index + m[0].length;
    return before.slice(Math.max(cut, floor));
  }
  if (save.labelled) {
    const failure = /\bFailure:/i.exec(text.slice(save.end));
    const start = failure ? save.end + failure.index : save.end;
    const success = /\bSuccess:/i.exec(text.slice(start));
    return text.slice(start, success ? start + success.index : text.length);
  }
  let end = sentenceEnd(text, save.end);
  let region = text.slice(save.end, end);
  // "...must make a DC 15 Dex save. On a failed save, it takes 20 (4d10) fire damage, or half..."
  for (let i = 0; i < 2 && OUTCOME_SENTENCE.test(text.slice(end).trimStart()); i++) {
    const nextEnd = sentenceEnd(text, end + 1);
    region += ` ${text.slice(end, nextEnd)}`;
    end = nextEnd;
  }
  return region;
}

function isImposedCondition(region: string, index: number): boolean {
  const before = region.slice(Math.max(0, index - 48), index);
  if (/\b(?:immune|can'?t|cannot|not|\w+n't|no longer|ends?|until|instead of|while|unless)\s+(?:\w+\s+)?$/i.test(before)) return false;
  return /\b(?:be|is|are|or|becomes?|become|being|becoming|has the|have the|gains? the|falls?|falling|knocked)\s+(?:(?:also|then|instead)\s+)?(?:[a-z]+ly\s+)?(?:knocked\s+)?(?:[a-z]+(?:,\s*(?:and\s+)?|\s+and\s+))*$/i.test(before);
}

function conditionsIn(region: string): SrdConditionName[] {
  const out: SrdConditionName[] = [];
  for (const name of SRD_CONDITION_NAMES) {
    const re = new RegExp(CONDITION_STEMS[name].source, "gi");
    for (const m of region.matchAll(re)) {
      if (isImposedCondition(region, m.index)) {
        out.push(name);
        break;
      }
    }
  }
  return out;
}

/** Damage that repeats ("at the start of each of its turns") is not the one-time damage of a failed save. */
const ONGOING =
  /\bat the (?:start|end) of (?:each|every|its|their|the [\w']+)(?![^.,]{0,25}\bnext\b)|\beach turn\b|\bevery (?:turn|round)\b|\bper turn\b|\bongoing\b/i;

interface FailRead {
  /** Null when the damage cannot be stated as one DamagePart list (a type that is a choice). */
  parts: DamagePart[] | null;
  /** Text where "half" may be said: the outcome, plus the clause before the save when the damage came from there. */
  halfText: string;
}

/** Damage on a failed save, from the save's own sentence, or (when it names none) the clause before it. */
function failDamage(text: string, save: SaveMatch, region: string, floor: number): FailRead {
  const after = readDamage(region, 0, region.length);
  if (after) {
    if (after.choice) return { parts: null, halfText: region };
    return { parts: ONGOING.test(region) ? [] : after.parts, halfText: region };
  }
  if (save.paren) return { parts: [], halfText: region };
  const sentenceStart = Math.max(floor, text.lastIndexOf(". ", save.index) + 1);
  const before = text.slice(sentenceStart, save.index);
  if (/\bunless\b|\bfails?\b|\bhalf\b/i.test(`${before} ${region}`)) {
    const prior = readDamage(before, 0, before.length);
    if (prior) {
      if (prior.choice) return { parts: null, halfText: region };
      return { parts: ONGOING.test(before) ? [] : prior.parts, halfText: `${before} ${region}` };
    }
  }
  return { parts: [], halfText: region };
}

/**
 * Build the structure for one save found in `text`; null when its damage type is a choice.
 * `floor` is where this save's own text may begin: an attack's save must not read the attack's damage.
 */
export function buildSave(text: string, save: SaveMatch, floor = 0): SaveStructure | null {
  const region = outcomeRegion(text, save, floor);
  // Conditions come from the plain failure only: not the success branch, not "Failure by 5 or More".
  const failureOnly = region.split(/\bOn a success\w*|\bSuccess:|\bFailure by\b|\bif the save succeeds\b/i)[0];
  const read = failDamage(text, save, region, floor);
  if (read.parts === null) return null;
  const fail = read.parts;
  const half = save.paren
    ? /\bhalf\b/i.test(save.parenTail)
    : save.labelled
      ? /\bSuccess:\s*Half/i.test(text.slice(save.end))
      : /half (?:as much|of that|damage|the damage|that)/i.test(read.halfText);
  return {
    ability: save.ability,
    dc: save.dc,
    fail,
    success: fail.length > 0 && half ? "half" : "none",
    // "knocked prone or pushed, the scarab's choice": which one applies is not in the prose's grammar.
    conditions: /\bchoice\b|\bchooses?\b/i.test(failureOnly) ? [] : conditionsIn(failureOnly),
  };
}
