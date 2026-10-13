/**
 * What ends the conditions a failed save imposes (#1050), in the phrasings the library uses:
 *  save    "The target can repeat the saving throw at the end of each of its turns, ending the
 *           effect on itself on a success."  2024: "The target repeats the save at the end of
 *           each of its turns, ending the effect on itself on a success."  Another save: "...a
 *           DC 15 Dexterity saving throw ... blinded for 1 minute. A blinded creature can make a
 *           DC 15 Constitution saving throw at the end of each of its turns, ending the effect."
 *  turn    "...or be frightened until the end of its next turn."  "...stunned until the end of
 *           the cloaker's next turn." (the source's turn: anyone but the bearer)  terse: "DC 13
 *           Dex save or be blinded until end of its next turn."
 *  rounds  "...or be poisoned for 1 minute." (ten rounds)  "...restrained for 3 rounds."
 *           Tome of Beasts 3: "blinded for 1 min (DC 17 Con negates)."
 *
 * The reader and the prose check share these patterns, so whatever the parser can
 * produce the check can confirm, and an agent's `ends` is held to the same words.
 * Relative `.ts` imports only: edge functions import this folder.
 */
import type { SaveAbility, SaveEnds, SaveStructure, SrdConditionName } from "../../types/statBlock.types.ts";
import type { TurnEdge } from "../../types/condition.types.ts";
import { ABILITY_RE_SOURCE, CONDITION_STEMS, NUMBER_WORDS, abilityFromWord } from "./vocab.ts";

type SaveOf = Pick<SaveStructure, "ability" | "dc">;

/**
 * One sentence of a repeat save: group 1 its DC and 2 its ability when it names them
 * ("can make a DC 15 Constitution saving throw", "repeat the Wisdom saving throw"),
 * 3 its edge. `[^.]` keeps it inside its sentence.
 */
const REPEAT = new RegExp(
  `\\b(?:(?:can|may|must)\\s+(?:also\\s+)?)?(?:repeats?|makes?)\\s+(?:the|this|that|its|a|another|a new)?\\s*` +
    `(?:DC\\s*(\\d+)\\s*,?\\s*)?(?:${ABILITY_RE_SOURCE}\\s+)?(?:saving throw|save)s?\\b[^.]*?` +
    `\\bat (?:the )?(start|beginning|end) of (?:each of |every one of )?(?:its|their|his|her) turns?\\b[^.]*`,
  "gi",
);

/** "the beginning of its next turn" is its start. */
function edgeOf(word: string): TurnEdge {
  return /^end$/i.test(word) ? "end" : "start";
}

/**
 * A repeat whose success is what ends the effect: said outright ("ending the effect",
 * "to end the effect early"), or implied by an optional repeat every turn ("can repeat
 * the saving throw at the end of each of its turns"; "...; a successful save ends the
 * paralysis"). "Must repeat ... at the end of each of its turns" alone is a loop of
 * further failures (more damage, a worse condition), not an end.
 */
function endsOnSuccess(sentence: string): boolean {
  if (/\bending\b|\bto end\b|\b(?:effect|condition) ends\b|\bsuccess(?:ful)?\b[^.]*\bends\b/i.test(sentence)) return true;
  return /\b(?:can|may)\s+(?:also\s+)?repeat/i.test(sentence) && /\beach of\b|\bevery one of\b/i.test(sentence);
}

/**
 * A save repeated once to decide what happens next ("must repeat the saving throw at
 * the end of its next turn. On a failure, the creature is petrified"), or a ladder of
 * failures (2024 "First Failure ... Second Failure"): the conditions change along
 * the way, so no one end applies to all of them.
 */
const PROGRESSIVE = /\brepeats?\b[^.]*\bnext turn\b|\b(?:First|Second|Third) Failure\b/i;

interface RepeatRead {
  at: TurnEdge;
  ability?: SaveAbility;
  dc?: number;
}

/** Every repeat in `text` that makes its effect save-ends, in order; none when the save is progressive. */
function repeats(text: string): RepeatRead[] {
  if (PROGRESSIVE.test(text)) return [];
  const out: RepeatRead[] = [];
  for (const m of text.matchAll(REPEAT)) {
    if (!endsOnSuccess(m[0])) continue;
    const ability = m[2] === undefined ? null : abilityFromWord(m[2]);
    out.push({ at: edgeOf(m[3]), ...(ability ? { ability } : {}), ...(m[1] !== undefined ? { dc: Number(m[1]) } : {}) });
  }
  return out;
}

/** The edge the save is repeated on, when the prose makes it a save-ends effect; null otherwise. */
export function repeatSaveEdge(text: string): TurnEdge | null {
  return repeats(text)[0]?.at ?? null;
}

/**
 * A repeat as a save-ends end of `save`: bare when it is the same save, with its own
 * ability and DC when it is another. Null for another save whose DC the prose leaves out.
 */
function saveEndsFrom(r: RepeatRead, save: SaveOf): SaveEnds | null {
  if (r.ability && r.ability !== save.ability && r.dc === undefined) return null;
  const ability = r.ability ?? save.ability;
  const dc = r.dc ?? save.dc;
  return ability === save.ability && dc === save.dc ? { kind: "save", at: r.at } : { kind: "save", at: r.at, ability, dc };
}

const NUMBER = `(\\d+|${Object.keys(NUMBER_WORDS).join("|")})`;
/** A duration right after a condition, in its own clause: group 1 edge and 2 whose turn, or 3 count and 4 unit. */
const DURATION = new RegExp(
  `\\b(?:until|til) (?:the )?(start|beginning|end) of ([^.;]{0,40}?)\\s*next turn\\b|\\bfor ${NUMBER} (rounds?|minutes?|min)\\b`,
  "i",
);
const DURATION_AT = new RegExp(`^(?:${DURATION.source})`, "i");
/** Words between a condition and a duration that hand the duration to something else ("prone, and it can't take reactions until..."). */
const HANDS_OFF = /\bcan'?t\b|\bcannot\b|\bspeed\b|\breactions?\b|\bwhich\b|\band (?:it|its|the|they|their)\b|\bunless\b|\bwhile\b/i;
/** The bearer's own turn: "its next turn", "the target's next turn". Any other possessive is the source's. */
const SELF = /^(?:its|their|his|her|the (?:target|creature)'?s?'?)$/i;

function count(word: string): number {
  return /^\d+$/.test(word) ? Number(word) : NUMBER_WORDS[word.toLowerCase()];
}

/** The duration a match states, or null for one a runner cannot count (an hour, a day). */
function durationFrom(m: RegExpExecArray): SaveEnds | null {
  if (m[1] !== undefined) {
    const whose = m[2].trim();
    if (!whose || /\s(?:is|are|was)$|^(?:is|are)$/i.test(whose)) return null;
    return { kind: "turn", at: edgeOf(m[1]), of: SELF.test(whose) ? "self" : "source" };
  }
  const n = count(m[3]);
  const rounds = /^min/i.test(m[4]) ? n * 10 : n;
  // A ten-minute effect still outlasts any fight; an hour (and longer) is not counted in rounds.
  return n >= 1 && rounds <= 100 ? { kind: "rounds", remaining: rounds } : null;
}

/**
 * The duration following one mention of a condition in its clause, or null. Only the
 * first "for" / "until" after the condition can be its duration: in "stunned for 1d4
 * rounds and charmed for 1 minute" the minute is the charm's, not the stun's.
 */
function durationAfter(region: string, at: number): SaveEnds | null {
  const clause = region.slice(at, at + 120).split(/[.;]/)[0];
  const first = /\b(?:for|until|til)\b/i.exec(clause);
  if (!first || HANDS_OFF.test(clause.slice(0, first.index))) return null;
  const m = DURATION_AT.exec(clause.slice(first.index));
  return m ? durationFrom(m) : null;
}

/** Field by field: an agent's JSON may order the keys differently, or carry one too many. */
function sameEnds(a: SaveEnds, b: SaveEnds, save: SaveOf): boolean {
  const keys = Object.keys(b).length;
  switch (a.kind) {
    case "save":
      return (
        b.kind === "save" &&
        b.at === a.at &&
        (b.ability ?? save.ability) === (a.ability ?? save.ability) &&
        (b.dc ?? save.dc) === (a.dc ?? save.dc) &&
        keys === 2 + (b.ability === undefined ? 0 : 1) + (b.dc === undefined ? 0 : 1)
      );
    case "turn":
      return b.kind === "turn" && b.at === a.at && b.of === a.of && keys === 3;
    case "rounds":
      return b.kind === "rounds" && b.remaining === a.remaining && keys === 2;
  }
}

/**
 * What ends `conditions`, read from an entry's prose. `after` is the text from the
 * save on (where a repeat sentence may stand); `failure` is the failed-save outcome
 * the conditions were read from. A repeat save wins over a stated duration ("paralyzed
 * for 1 minute. The target can repeat the saving throw..."): the minute is a cap the
 * save almost always reaches first, and one record holds one end. A duration counts
 * only when it is the same for every condition, so "poisoned for 1 minute and knocked
 * prone" gets no end rather than giving prone a minute.
 */
export function readSaveEnds(
  after: string,
  failure: string,
  conditions: SrdConditionName[],
  save: SaveOf,
): SaveEnds | undefined {
  if (conditions.length === 0) return undefined;
  const repeat = repeats(after)[0];
  if (repeat) return saveEndsFrom(repeat, save) ?? undefined;
  if (PROGRESSIVE.test(after)) return undefined;

  let found: SaveEnds | null = null;
  for (const name of conditions) {
    let own: SaveEnds | null = null;
    for (const m of failure.matchAll(new RegExp(CONDITION_STEMS[name].source, "gi"))) {
      own = durationAfter(failure, m.index);
      if (own) break;
    }
    if (!own) return undefined;
    if (found && !sameEnds(found, own, save)) return undefined;
    found = own;
  }
  return found ?? undefined;
}

/** Whether `body` states `ends` for `save` in words the reader above understands (the prose check). */
export function endsInProse(ends: SaveEnds, body: string, save: SaveOf): boolean {
  if (ends.kind === "save") {
    return repeats(body).some((r) => {
      const read = saveEndsFrom(r, save);
      return read !== null && sameEnds(read, ends, save);
    });
  }
  for (const m of body.matchAll(new RegExp(DURATION.source, "gi"))) {
    const read = durationFrom(m);
    if (read && sameEnds(read, ends, save)) return true;
  }
  return false;
}
