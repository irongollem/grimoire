/**
 * The sentence templates that prove a spell's roll from its own text (#1123).
 * The importer derives a roll with these and the checker approves a stored roll
 * with these, so what is read in and what is accepted cannot drift apart.
 * Every matcher returns null unless the text names exactly one reading.
 */

import type { SpellEffectInstances } from "@/types/spell.types";

export const DAMAGE_TYPES = [
  "acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic",
  "piercing", "poison", "psychic", "radiant", "slashing", "thunder",
] as const;

export interface DamagePart {
  dice: string;
  type: string;
}

const DICE = String.raw`\d+d\d+(?:\s*[+-]\s*\d+)?`;
const TYPE = `(${DAMAGE_TYPES.join("|")})`;
const TARGET = "(?:the target|it|the creature|a creature)";
/** The half clause that rides on the damage sentence itself. */
const HALF_TAIL = String.raw`(?:or|and) half as much damage on a successful (?:one|save)`;
/** Half, in the three wordings `buildStructuredSpellEffects` turns into a save-half effect. */
const HALF = "half (?:as much damage|the damage|damage)";
const ABILITY = "(?:strength|dexterity|constitution|intelligence|wisdom|charisma)";
/** The subject of a damage clause: "the target", "that creature", "each creature in the line". The caster's own cost is SELF_DAMAGE. */
const SUBJECT = String.raw`[^.,;:()]{1,40}?`;
const NAMED_DT = `(?<dice>${DICE}) (?<type>${DAMAGE_TYPES.join("|")})`;
const NAMED_ABILITY = `(?<ability>${ABILITY})`;

export const normDice = (dice: string): string => dice.toLowerCase().replace(/\s+/g, "");
export const cleanText = (text: string): string => text.toLowerCase().replace(/\s+/g, " ").trim();

const part = (dice: string, type: string): DamagePart => ({ dice: normDice(dice), type });
const key = (p: DamagePart): string => `${p.dice} ${p.type}`;

function distinct(parts: DamagePart[]): DamagePart[] {
  const seen = new Map(parts.map((p) => [key(p), p]));
  return [...seen.values()];
}

function collect(text: string, pattern: string): DamagePart[] {
  return [...text.matchAll(new RegExp(pattern, "g"))].map((m) => part(m[1], m[2]));
}

/** Every "<dice> <type> damage" in the text, whatever sentence it is in. */
export function damageClauses(description: string): DamagePart[] {
  return distinct(collect(cleanText(description), `(${DICE}) ${TYPE} damage`));
}

/** The text's other damage clauses must all be the candidate itself (Spirit Guardians offers a second type). */
function only(text: string, candidates: DamagePart[]): DamagePart[] | null {
  const wanted = new Set(candidates.map(key));
  const clauses = damageClauses(text);
  return clauses.every((c) => wanted.has(key(c))) ? candidates : null;
}

function single(candidates: DamagePart[], text: string): DamagePart[] | null {
  const found = distinct(candidates);
  return found.length === 1 ? only(text, found) : null;
}

/** Damage that lands later or on someone else: a turn boundary, a zone, or the caster's own cost. */
const TURN_TIMING = new RegExp([
  String.raw`(?<!until the |before the )\b(?:starts?|ends?|begins?|beginning|ending)\b[^.]{0,20}\bturns?\b`,
  String.raw`\bat the (?:start|end) of\b`, String.raw`\b(?:enters?|entering)\b`, String.raw`\b(?:each|every|per) (?:round|turn)\b`,
  String.raw`\bfirst time\b`, String.raw`\bsubsequent\b`, String.raw`\bwhile\b`, String.raw`\b(?:during|on) (?:its|their|your) turn\b`,
  String.raw`\bwhen the spell ends\b`, String.raw`\bafter every\b`, String.raw`\bat any time\b`,
].join("|"));
/** Anywhere in the text: the damage comes again (a breath that recharges, later rounds, "each time it starts"). */
const RECURRING = /\b(?:recharge|subsequent|each time)\b/;
const SELF_DAMAGE = /\byou (?:also |each )?(?:take|suffer|inflict)\b|\bon yourself\b|\byou and\b/;

/**
 * True when no damage sentence is tied to a turn or a zone and the caster pays none of it.
 * The plain templates below ask for it; the older SRD forms predate it and do not.
 */
function damageIsPlain(text: string): boolean {
  if (SELF_DAMAGE.test(text) || RECURRING.test(text)) return false;
  // A save sentence counts too (Greater Maze: "makes a save each time it starts its turn"), except a condition's repeat save.
  const bearsDamage = (sentence: string): boolean =>
    /\bdamage\b/.test(sentence) || (/\bsaving throws?\b/.test(sentence) && !/\brepeat/.test(sentence));
  return text.split(/(?<=[.!?])\s+/).every((sentence) => !bearsDamage(sentence) || !TURN_TIMING.test(sentence));
}

interface NamedRead {
  part: DamagePart;
  /** The save ability the sentence itself names, when it does. */
  ability: string | null;
}

function collectNamed(text: string, patterns: string[]): NamedRead[] {
  return patterns.flatMap((pattern) => [...text.matchAll(new RegExp(pattern, "g"))].flatMap((m) => {
    const g = m.groups;
    return g?.dice && g.type ? [{ part: part(g.dice, g.type), ability: g.ability ?? null }] : [];
  }));
}

/** "On a hit, the target takes 1d10 fire damage." Also "If the attack hits, ..." and "If it hits, ...". */
export function matchAttackDamage(description: string): DamagePart[] | null {
  const text = cleanText(description);
  const plain = damageIsPlain(text)
    ? collectNamed(text, [`(?:on a hit|if the attack hits|if it hits),? ${SUBJECT} takes? ${NAMED_DT} damage`]).map((read) => read.part)
    : [];
  return single([...collect(text, `on a hit,? ${TARGET} takes (${DICE}) ${TYPE} damage`), ...plain], text);
}

export interface SaveDamage {
  parts: DamagePart[];
  half: boolean;
  /** The save ability the damage sentence names (lowercase); null when only another sentence names it. */
  ability: string | null;
}

/**
 * Save damage: one part, or two parts in one sentence ("takes 2d8 bludgeoning damage
 * and 4d6 cold damage on a failed save, or half as much damage on a successful one").
 * `half` says a successful save halves the damage, in the same sentence or the next.
 */
export function matchSaveDamage(description: string): SaveDamage | null {
  const text = cleanText(description);
  const two = [...text.matchAll(new RegExp(
    `(?:takes?|taking) (${DICE}) ${TYPE} damage and (${DICE}) ${TYPE} damage (?:on a failed save,? ${HALF_TAIL}|,? or half as much damage on a successful (?:one|save))`,
    "g",
  ))];
  if (two.length > 0) {
    // A second, different two-part sentence leaves a clause outside this pair, which `only` refuses.
    const first = part(two[0][1], two[0][2]);
    const second = part(two[0][3], two[0][4]);
    if (first.type === second.type || !only(text, [first, second])) return null;
    return { parts: [first, second], half: true, ability: null };
  }
  const candidates = [
    ...collect(text, `(${DICE}) ${TYPE} damage,? on a failed save,? ${HALF_TAIL}`),
    ...collect(text, `on a failed save,? ${TARGET} takes (${DICE}) ${TYPE} damage`),
    ...collect(text, `saving throw or takes? (${DICE}) ${TYPE} damage`),
  ];
  // Plainer wordings the third-party books use for the same two shapes (half on a save, nothing on a save).
  const plain = damageIsPlain(text);
  const halved = !plain ? [] : collectNamed(text, [
    `takes? ${NAMED_DT} damage,? or ${HALF} (?:if (?:it|they|the target|the creature|a creature) makes? a|with a|on a) successful ${NAMED_ABILITY} saving throw`,
    `takes? ${NAMED_DT} damage on a failed ${NAMED_ABILITY} saving throw,? or ${HALF} on a successful save`,
    `takes? ${NAMED_DT} damage on a failed save,? or ${HALF} on a success\\b`,
  ]);
  const whole = !plain ? [] : collectNamed(text, [
    `(?:succeed on|make) an? (?:successful )?${NAMED_ABILITY} saving throw,? or takes? ${NAMED_DT} damage`,
    `on a (?:failed save|failure),? ${SUBJECT} takes? ${NAMED_DT} damage`,
  ]);
  const parts = single([...candidates, ...halved.map((read) => read.part), ...whole.map((read) => read.part)], text);
  if (!parts) return null;
  const named = new Set([...halved, ...whole].flatMap((read) => (read.ability ? [read.ability] : [])));
  const inline = new RegExp(`(?:damage|failed save),? ${HALF_TAIL}`).test(text);
  const next = new RegExp(`on a successful save,? ${TARGET} takes half as much damage`).test(text)
    || (plain && new RegExp(`on a (?:successful save|success),? ${SUBJECT} takes half as much damage`).test(text));
  return { parts, half: inline || next || halved.length > 0, ability: named.size === 1 ? [...named][0] : null };
}

/** "A creature you touch regains a number of hit points equal to 1d8 + your modifier." */
export function matchHealing(description: string): string | null {
  const text = cleanText(description);
  const found = new Set([
    ...[...text.matchAll(new RegExp(`regains? (?:a number of )?hit points equal to (${DICE})(?!\\d)`, "g"))].map((m) => normDice(m[1])),
    ...[...text.matchAll(new RegExp(`regains? (${DICE}) hit points`, "g"))].map((m) => normDice(m[1])),
  ]);
  return found.size === 1 ? [...found][0] : null;
}

/** Dice as prose writes them, including a bare "d4" with no count. */
const DICE_ANY = String.raw`\b\d*d\d+(?:\s*[+-]\s*\d+)?\b(?!\s+tests?\b)`; // "D20 Tests" names the roll, it does not make one

/** modifier_to_roll: a die the creature adds to, or takes from, a later roll or damage taken (Bless, Resistance). */
export type DiceRole = "damage_or_hit_points" | "decides_outcome" | "modifier_to_roll" | "other";

export interface TextDie {
  dice: string;
  role: DiceRole;
}

/** Every dice expression in the text with what it is for. */
export function classifyTextDice(text: string): TextDie[] {
  const dice: TextDie[] = [];
  for (const sentence of cleanText(text).split(/(?<=[.!?])\s+|\n+/)) {
    for (const m of sentence.matchAll(new RegExp(DICE_ANY, "g"))) {
      const after = sentence.slice((m.index ?? 0) + m[0].length);
      let role: DiceRole = "other";
      if (sentence.includes("|")) role = "decides_outcome";
      else if (/\bdamage\b/.test(after) || /\bhit points\b/.test(sentence) || /\bdamage die\b/.test(sentence)) role = "damage_or_hit_points";
      else if (/\b(?:determine|decide|consult|consults|table|outcome)\b/.test(sentence)) role = "decides_outcome";
      else if (/\b(?:adds?|subtracts?)\b[^.]*\b(?:attack rolls?|saving throws?|saves?|ability checks?)\b/.test(sentence)
        || /\breduces? the (?:total )?damage[^.]*\bby\b/.test(sentence)) role = "modifier_to_roll";
      dice.push({ dice: normDice(m[0]), role });
    }
  }
  return dice;
}

/** Every dice expression in the text, a bare "d4" included. */
export function textDiceIn(text: string): string[] {
  return classifyTextDice(text).map((die) => die.dice);
}

/**
 * True when the text puts this roll somewhere other than damage or hit points
 * (Bless: "adds 1d4 to the attack roll"). A roll the text never mentions is not
 * called junk: absence of proof is not proof.
 */
export function rollIsNotDamageOrHealing(description: string, dice: string): boolean {
  const want = normDice(dice);
  const same = classifyTextDice(description).filter((die) => die.dice === want || die.dice.replace(/[+-]\d+$/, "") === want);
  return same.length > 0 && same.every((die) => die.role !== "damage_or_hit_points");
}

/** The damage types an upcast sentence names: "the bludgeoning damage increases by ...". */
export function upcastNamedTypes(higherLevels: string): string[] {
  const text = cleanText(higherLevels);
  return DAMAGE_TYPES.filter((type) => new RegExp(`\\b${type} damage\\b`).test(text));
}

// ---------------------------------------------------------------------------
// Damage type chosen at cast (Chromatic Orb, Dragon's Breath, Spirit Guardians)
// ---------------------------------------------------------------------------

export interface ChoiceDamage {
  dice: string;
  /** Lowercase, in the order the text lists them. */
  choices: string[];
  /** A successful save halves the damage (save spells only). */
  half: boolean;
}

/** "choose Acid, Cold, Fire, Lightning, or Poison": the list, only when every word is a damage type. */
function chosenList(text: string): string[] | null {
  const lists = [...text.matchAll(/\bchoose ([a-z]+(?:, [a-z]+)*,? or [a-z]+)(?= for the type of |[.:])/g)];
  if (lists.length !== 1) return null;
  const words = lists[0][1].split(/,\s*(?:or\s+)?|\s+or\s+/);
  const known = new Set<string>(DAMAGE_TYPES);
  if (words.length < 2 || new Set(words).size !== words.length || !words.every((word) => known.has(word))) return null;
  return words;
}

const CHOSEN_TYPE = "damage of the (?:chosen type|type you chose)";
const NEXT_SENTENCE_HALF = new RegExp(`on a successful save,? ${TARGET} takes half as much damage`);

/** "On a hit, the target takes 3d8 damage of the chosen type." beside a "choose A, B, or C" list. */
export function matchChoiceAttackDamage(description: string): ChoiceDamage | null {
  const text = cleanText(description);
  const found = collect(text, `on a hit,? ${TARGET} takes (${DICE}) ${CHOSEN_TYPE}`);
  const choices = chosenList(text);
  if (found.length !== 1 || !choices) return null;
  return { dice: found[0].dice, choices, half: false };
}

/**
 * Save damage whose type is the caster's pick: "taking 3d6 damage of the chosen type on a
 * failed save or half as much damage on a successful one" (Dragon's Breath), or two
 * typed clauses of equal dice, one per alternative (Spirit Guardians).
 */
export function matchChoiceSaveDamage(description: string): ChoiceDamage | null {
  const text = cleanText(description);
  const listed = collect(text, `(?:taking|takes) (${DICE}) ${CHOSEN_TYPE} on a failed save,? ${HALF_TAIL}`);
  const choices = chosenList(text);
  if (listed.length === 1 && choices && damageClauses(text).length === 0) {
    return { dice: listed[0].dice, choices, half: true };
  }
  const alternatives = [...text.matchAll(new RegExp(
    `on a failed save,? ${TARGET} takes (${DICE}) ${TYPE} damage \\(if [^()]*\\) or (${DICE}) ${TYPE} damage \\(if [^()]*\\)`,
    "g",
  ))];
  if (alternatives.length !== 1) return null;
  const first = part(alternatives[0][1], alternatives[0][2]);
  const second = part(alternatives[0][3], alternatives[0][4]);
  if (first.dice !== second.dice || first.type === second.type || !only(text, [first, second])) return null;
  return { dice: first.dice, choices: [first.type, second.type], half: NEXT_SENTENCE_HALF.test(text) };
}

// ---------------------------------------------------------------------------
// Extra damage on a hit (Hex, Hunter's Mark, Divine Favor, Branding Smite)
// ---------------------------------------------------------------------------

/** What marks damage that keeps coming on later turns, which a one-off rider roll cannot hold. */
const RIDER_REPEAT = /\b(?:at the (?:start|end) of|each of its turns?|each of your turns?|every turn|each turn|each round|repeat)/;
/** The extra damage is tied to a weapon hit, not dealt at cast. */
const RIDER_HIT = /\b(?:whenever you hit|when you hit|on a hit|the next time you hit|from the attack)\b/;

/**
 * One "extra <dice> <type> damage" clause tied to a hit, and nothing else that deals
 * or rolls damage. Returns the rider's roll, which is rolled when a weapon hits, not at cast.
 */
export function matchRider(description: string): DamagePart | null {
  const text = cleanText(description);
  if (/\bsaving throws?\b/.test(text) || RIDER_REPEAT.test(text) || !RIDER_HIT.test(text)) return null;
  const extra = collect(text, `\\bextra (${DICE}) ${TYPE} damage`);
  // One die in the whole text, so no other clause deals or rolls damage.
  if (extra.length !== 1 || classifyTextDice(text).length !== 1) return null;
  return extra[0];
}

/** The text with the rider's own wording ("an extra", "whenever you hit") made plain, for the red-flag scan. */
export function withoutRiderWording(description: string): string {
  return cleanText(description)
    .replace(new RegExp(`\\bextra (${DICE} ${TYPE} damage)`), "$1")
    .replace(/\bwhenever you hit\b/, "when you hit");
}

/** "Your Concentration can last longer with a spell slot of level 2 (up to 4 hours)": longer duration, no roll. */
export function isDurationOnlyUpcast(higherLevels: string): boolean {
  const sentences = cleanText(higherLevels).split(/(?<=\.)\s+/).filter(Boolean);
  return sentences.length > 0 && sentences.every((sentence) =>
    /\bconcentration\b/.test(sentence) && /\bhours?\b/.test(sentence) && !/\b(?:damage|target|creature|additional|more|extra)\b/.test(sentence));
}

/**
 * Wording that reads like a repeat to the red-flag scan but is a sustained zone, accepted
 * only in this exact form (Spirit Guardians 2024: "whenever the Emanation enters ...").
 */
export function withoutZoneTrigger(text: string): string {
  return text.replace(
    /whenever the emanation enters a creature['\u2019]s space and whenever a creature enters the emanation or ends its turn there/g,
    "when a creature is in the emanation",
  );
}

// ---------------------------------------------------------------------------
// Several rays, darts or beams (Scorching Ray, Magic Missile, Eldritch Blast)
// ---------------------------------------------------------------------------

export interface InstanceRead {
  instances: SpellEffectInstances;
  /** Each instance is aimed with its own spell attack roll; false for darts that strike on their own. */
  attack: boolean;
  /** A dart's damage, stated in the instance's own sentence; null when an on-a-hit sentence carries it. */
  damage: DamagePart | null;
  /** The text with the instance sentences taken out, for the red-flag scan and the upcast check. */
  description: string;
  higherLevels: string;
}

interface Texts {
  d: string;
  h: string;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const NUM = "(one|two|three|four|five|six)";
const ORDINAL = String.raw`\d+(?:st|nd|rd|th)`;

/** Take one sentence out of whichever field holds it; it must occur exactly once across both. */
function take(texts: Texts, pattern: string): { texts: Texts; match: RegExpMatchArray } | null {
  const re = new RegExp(`(?:^|(?<=\\. ))${pattern}`, "g");
  const inDescription = [...texts.d.matchAll(re)];
  const inHigher = [...texts.h.matchAll(re)];
  if (inDescription.length + inHigher.length !== 1) return null;
  const strip = (s: string): string => s.replace(re, " ").replace(/\s+/g, " ").trim();
  return { texts: { d: strip(texts.d), h: strip(texts.h) }, match: inDescription[0] ?? inHigher[0] };
}

function takeAll(texts: Texts, patterns: string[]): { texts: Texts; matches: RegExpMatchArray[] } | null {
  let rest = texts;
  const matches: RegExpMatchArray[] = [];
  for (const pattern of patterns) {
    const taken = take(rest, pattern);
    if (!taken) return null;
    rest = taken.texts;
    matches.push(taken.match);
  }
  return { texts: rest, matches };
}

/** "one more dart for each slot level above 1st": the upcast sentence for a noun, at the spell's own level. */
function perSlotPattern(noun: string): string {
  return String.raw`(?:when you cast this spell using a spell slot of (${ORDINAL}) level or higher, )?(?:you create|the spell creates) one (?:additional|more) ${noun} for each (?:spell )?slot level above (\d+)(?:st|nd|rd|th)?\.`;
}

function countedSet(
  texts: Texts,
  spellLevel: number,
  noun: "ray" | "dart",
  sentences: string[],
  attack: boolean,
): InstanceRead | null {
  const taken = takeAll(texts, sentences);
  const upcast = taken ? take(taken.texts, perSlotPattern(noun)) : null;
  if (!taken || !upcast) return null;
  const count = NUMBER_WORDS[taken.matches[0][1]];
  const [, unlocks, above] = upcast.match;
  // "a slot of 3rd level or higher" and "above 2nd" must both be the spell's own level plus one / the level itself.
  if (Number(above) !== spellLevel || (unlocks !== undefined && parseInt(unlocks, 10) !== spellLevel + 1)) return null;
  // The dart set's third sentence is its damage; a ray's damage comes from the on-a-hit sentence.
  const damage = noun === "dart" ? part(taken.matches[2][1], taken.matches[2][2]) : null;
  return {
    instances: { noun, count, perSlotAbove: 1 },
    attack,
    damage,
    description: upcast.texts.d,
    higherLevels: upcast.texts.h,
  };
}

function rayOrDart(texts: Texts, spellLevel: number): InstanceRead | null {
  return countedSet(texts, spellLevel, "ray", [
    String.raw`you (?:create|hurl) ${NUM} (?:fiery )?rays(?: of fire and hurl them at targets within range)?\.`,
    String.raw`you can hurl them at one target(?: within range)? or (?:at )?several\.`,
    String.raw`make a ranged spell attack for each ray\.`,
  ], true) ?? countedSet(texts, spellLevel, "dart", [
    String.raw`you create ${NUM} glowing darts of magical force\.`,
    String.raw`each dart (?:hits|strikes) a creature of your choice that you can see within range\.`,
    String.raw`a dart deals (${DICE}) ${TYPE} damage to its target\.`,
    String.raw`the darts all strike simultaneously, and you can direct them to hit one creature or several\.`,
  ], false);
}

function beams(texts: Texts): InstanceRead | null {
  const step = String.raw`${NUM} beams at (?:level (\d+)|(\d+)(?:st|nd|rd|th) level)`;
  const taken = takeAll(texts, [
    String.raw`the spell creates (?:more than one beam when you reach higher levels: )?${step}, ${step}, and ${step}\.`,
    String.raw`you can direct the beams at the same target or at different ones\.`,
    String.raw`make a separate attack roll for each beam\.`,
  ]);
  if (!taken) return null;
  const g = taken.matches[0];
  const steps = [1, 4, 7].map((i) => ({ count: NUMBER_WORDS[g[i]], level: Number(g[i + 1] ?? g[i + 2]) }));
  const ordered = steps.every((s, i) => s.count === i + 2 && (i === 0 || s.level > steps[i - 1].level));
  if (!ordered) return null;
  return {
    instances: { noun: "beam", count: 1, byCharacterLevel: steps.map((s) => ({ level: s.level, count: s.count })) },
    attack: true,
    damage: null,
    description: taken.texts.d,
    higherLevels: taken.texts.h,
  };
}

/**
 * The count of rays, darts or beams a spell creates, read from its own sentences. Every
 * sentence of the set must occur exactly once, word for word, or it is not a match.
 */
export function matchInstances(description: string, higherLevels: string | null, spellLevel: number): InstanceRead | null {
  const texts: Texts = { d: cleanText(description), h: higherLevels ? cleanText(higherLevels) : "" };
  return rayOrDart(texts, spellLevel) ?? beams(texts);
}
