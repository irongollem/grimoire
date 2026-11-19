/**
 * Jev as a picker of a monster's turn (#1203 story 3): pure request builders and answer readers, with the model call
 * left to the caller. The note judge (`noteRequest`, `optionsAllowedByNote`) is used by `take_turn`
 * (`encounter-command/takeTurn.ts`). The turn pickers (`choiceRequest`, `scoreRequest`, `pickFromChoice`,
 * `pickFromScores`) are used only by the evaluation script `scripts/tactics-eval/run.ts`, which measures whether they
 * pick a turn better than the rules-only `pickTurn`.
 *
 * Same house style as `search-campaign/rerank.ts` and `import-match/judging.ts`: the builders are pure, the call is
 * injected by whoever runs them, nothing throws, and an answer that is missing or names nothing on the list reads as
 * null so the caller keeps the rules-only pick.
 *
 * What the pilot (#1061) taught about asking Jev, and where it shows here:
 *   - code states every number (hit chance, expected damage, hit points as "9 of 20") and no question asks for
 *     arithmetic;
 *   - one narrow judgment per question: "which of these turns does this creature take" (a Choice), or "does this turn
 *     fit this creature" for each turn (a Score per turn). Never both in one request;
 *   - a Score runs generous, so scores are only ever a RANKING (`pickFromScores` takes the highest, a tie goes to the
 *     rules-only pick);
 *   - the state holds named fields, not a wall of text.
 *
 * Not modelled: what the creature can see. Every living hostile on the board is described with its hit points, as the
 * options themselves already are (an option may name any of them), whether or not the creature would know them.
 * Darkness, invisibility and hearing are not in the rules either. A reader of a result should know the judge is
 * given a little more than a real creature would have.
 *
 * Pure and edge-importable: relative `.ts` imports only, no Deno globals.
 */

import type { TacticalProfile } from "../../../src/rules/fight/tactics/profile.ts";
import type { TurnOption } from "../../../src/rules/fight/terrain/turnOptions.ts";
import type { RunCombatant } from "../../../src/types/encounter.types.ts";
import { isAllyOf } from "../../../src/rules/fight/allies.ts";
import { isHostileTo, type FactionSides } from "../../../src/rules/fight/sides.ts";
import { choiceOf, noulOf, scoreOf, type JudgeRequest, type JudgeResult } from "./typesafe.ts";

/** Which wording of the questions this is. The wording decides the result (#1061), so a measurement names it. */
export const TACTICS_WORDING = "v1";

/** The name of the single Choice question. */
export const CHOICE_QUESTION = "turn";

export interface TurnJudgeInput {
  /** The creature whose turn it is, as it stands now. */
  mover: RunCombatant;
  profile: TacticalProfile;
  /** Everyone in the fight, the mover included. */
  combatants: readonly RunCombatant[];
  /** The gated, numbered options: the only turns the judge is shown. */
  options: readonly TurnOption[];
  /**
   * The fight's factions, which say who is an enemy (`isHostileTo`) and who an ally (`isAllyOf`). Left out, the fight
   * has no faction table: a different faction is an opponent and only the mover's own faction is an ally, which is how
   * `sides.ts` reads an empty table.
   */
  factions?: FactionSides;
}

/** The key an option goes by in a request: its place in the list, so a reply maps back without parsing an id. */
export const turnKey = (index: number): string => `turn_${index + 1}`;

// ── how it thinks ───────────────────────────────────────────────────────────────

const TIER_SENTENCE: Record<TacticalProfile["tier"], string> = {
  instinct: "It acts on instinct alone: it cannot plan, weigh cover or pick its victim.",
  simple: "It is simple-minded: it fights hard and without cunning, and has some sense of when a fight is going badly.",
  trained: "It is trained and has sense: it weighs the risks of a move and spots a weak enemy.",
  tactical: "It is cunning: it plans, uses cover and ground, and goes for the enemy that matters most.",
};

const ROLE_SENTENCE: Record<TacticalProfile["role"], string> = {
  brute: "It is a close-combat bruiser.",
  skirmisher: "It is a fast skirmisher that darts in and out.",
  artillery: "It fights from a distance and does not want to be in melee.",
  controller: "It controls the fight with spells and special powers rather than blows.",
  leader: "It leads others and fights where its followers fight.",
  lurker: "It is an ambusher that prefers to strike from hiding.",
};

const TARGET_SENTENCE: Record<TacticalProfile["targets"], string> = {
  nearest: "It goes for whoever is nearest.",
  most_wounded: "It goes for the most wounded enemy.",
  spellcasters_first: "It goes for an enemy holding a spell, else the most wounded.",
  lowest_armor: "It goes for the enemy with the weakest armor.",
};

const COVER_SENTENCE: Record<TacticalProfile["cover"], string> = {
  ignores: "It pays no attention to cover.",
  when_cheap: "It takes cover when that costs little.",
  fights_from: "It likes to fight from cover.",
};

function moraleSentence(morale: TacticalProfile["morale"]): string {
  if (morale.breaksAt <= 0 || morale.then === "fight_on") return "It never breaks and fights to the end.";
  const share = `${Math.round(morale.breaksAt * 100)} percent of its hit points`;
  return morale.then === "surrender" ? `It surrenders when reduced to ${share}.` : `It flees when reduced to ${share}.`;
}

/** The plain description of the profile, one sentence per rule, in a fixed order. */
export function howItThinks(profile: TacticalProfile): string[] {
  return [TIER_SENTENCE[profile.tier], ROLE_SENTENCE[profile.role], TARGET_SENTENCE[profile.targets], COVER_SENTENCE[profile.cover], moraleSentence(profile.morale)];
}

// ── the state ───────────────────────────────────────────────────────────────────

const percent = (n: number): number => Math.round(n * 100);
const oneDecimal = (n: number): number => Math.round(n * 10) / 10;

function health(c: RunCombatant): string {
  const share = c.max_hp > 0 ? ` (${percent(c.hp / c.max_hp)} percent)` : "";
  return `${c.hp} of ${c.max_hp} hit points${share}`;
}

export interface PersonFacts {
  name: string;
  health: string;
  conditions?: string[];
  holding_a_spell?: true;
}

function personFacts(c: RunCombatant): PersonFacts {
  return {
    name: c.name,
    health: health(c),
    ...(c.conditions.length > 0 ? { conditions: c.conditions.map((k) => k.name) } : {}),
    ...(c.concentration ? { holding_a_spell: true as const } : {}),
  };
}

export interface TurnFacts {
  what: string;
  target?: string;
  moves_feet?: number;
  hit_chance_percent?: number;
  expected_damage?: number;
  provokes_opportunity_attacks_from?: string[];
  target_has_cover?: string;
}

function turnFacts(option: TurnOption, names: ReadonlyMap<string, string>): TurnFacts {
  const target = option.targetId === null ? undefined : names.get(option.targetId);
  const attack = option.attack;
  // A spell is weighed like an attack: its chance and its expected damage (over all its targets) are the numbers it has.
  const numbers = attack !== null ? attack : option.spell === undefined ? null : option.spell;
  const cover = attack === null || attack.cover === null || attack.cover === "none" ? undefined : attack.cover.replace("_", "-");
  return {
    what: option.summary,
    ...(target === undefined ? {} : { target }),
    ...(option.feet === null || option.feet === 0 ? {} : { moves_feet: option.feet }),
    ...(numbers === null || numbers.hitChance === null ? {} : { hit_chance_percent: percent(numbers.hitChance) }),
    ...(numbers === null || numbers.expectedDamage === null ? {} : { expected_damage: oneDecimal(numbers.expectedDamage) }),
    ...(option.provokes.length === 0 ? {} : { provokes_opportunity_attacks_from: option.provokes.map((p) => names.get(p.enemyId) ?? p.enemyId) }),
    ...(cover === undefined ? {} : { target_has_cover: cover }),
  };
}

export interface TurnState {
  creature: {
    name: string;
    health: string;
    how_it_thinks: string[];
    /** The Dungeon Master's own line, verbatim; null when there is none. */
    note: string | null;
  };
  enemies: PersonFacts[];
  allies: PersonFacts[];
  turns: Record<string, TurnFacts>;
}

function stateOf(input: TurnJudgeInput): TurnState {
  const { mover, profile, combatants, options } = input;
  const names = new Map(combatants.map((c) => [c.instance_id, c.name]));
  const standing = (c: RunCombatant) => c.instance_id !== mover.instance_id && c.hp > 0;
  const factions = input.factions ?? [];
  const turns: Record<string, TurnFacts> = {};
  options.forEach((option, i) => {
    turns[turnKey(i)] = turnFacts(option, names);
  });
  return {
    creature: { name: mover.name, health: health(mover), how_it_thinks: howItThinks(profile), note: profile.note },
    // A Neutral is neither list: it is nobody's foe and fights beside nobody (`sides.ts`, `allies.ts`).
    enemies: combatants.filter((c) => standing(c) && isHostileTo(mover, c, factions)).map(personFacts),
    allies: combatants.filter((c) => standing(c) && isAllyOf(mover, c, factions)).map(personFacts),
    turns,
  };
}

// ── the questions ───────────────────────────────────────────────────────────────

const AS_THIS_CREATURE =
  "Judge it as this particular creature would, given how it thinks (`creature.how_it_thinks`), its note (`creature.note`) if it has one, its health and the fight around it, not as a perfect tactician would.";

/** A line the Choice shows for one turn: what it is and the numbers code worked out. */
function choiceLine(facts: TurnFacts): string {
  const numbers =
    facts.hit_chance_percent === undefined || facts.expected_damage === undefined ? "" : ` Chance to hit ${facts.hit_chance_percent} percent, about ${facts.expected_damage} damage.`;
  return `${facts.what}.${numbers}`;
}

/**
 * One Choice question: which of these turns does this creature take. Null when there are fewer than two turns, since
 * there is nothing to judge.
 */
export function choiceRequest(input: TurnJudgeInput): JudgeRequest | null {
  if (input.options.length < 2) return null;
  const state = stateOf(input);
  const criteria: Record<string, string> = {};
  for (const [key, facts] of Object.entries(state.turns)) criteria[key] = choiceLine(facts);
  return {
    state,
    questions: {
      [CHOICE_QUESTION]: {
        type: "choice",
        instructions: `Which of these turns does the creature in \`creature\` take now? ${AS_THIS_CREATURE}`,
        criteria,
      },
    },
  };
}

/** Five levels, lowest first. A Score runs generous, so only the ranking of one turn against the others is used. */
const FIT_LEVELS = [
  "This turn is out of character for this creature, or plainly foolish for it.",
  "This turn is unlikely for this creature.",
  "This turn is plausible for this creature.",
  "This turn is a good choice for this creature.",
  "This turn is exactly what this creature would do.",
];

/** One Score question per turn: how well does it fit this creature. Null when there are fewer than two turns. */
export function scoreRequest(input: TurnJudgeInput): JudgeRequest | null {
  if (input.options.length < 2) return null;
  const state = stateOf(input);
  const questions: JudgeRequest["questions"] = {};
  for (const key of Object.keys(state.turns)) {
    questions[key] = {
      type: "score",
      instructions: `How well does the turn in \`turns.${key}\` fit what the creature in \`creature\` would do now? ${AS_THIS_CREATURE}`,
      criteria: FIT_LEVELS,
    };
  }
  return { state, questions };
}

// ── the readers ─────────────────────────────────────────────────────────────────

export interface JudgedPick {
  optionId: string;
  /** The model's own confidence in the answer, or null when it gave none. */
  confidence: number | null;
}

/** The option a Choice answer names, or null when there is no answer or it names nothing on the list. */
export function pickFromChoice(result: JudgeResult, options: readonly TurnOption[]): JudgedPick | null {
  const answer = choiceOf(result, CHOICE_QUESTION);
  if (answer === null) return null;
  const index = options.findIndex((_, i) => turnKey(i) === answer.choice);
  if (index < 0) return null;
  return { optionId: options[index].id, confidence: answer.confidence };
}

/**
 * The best-scored option. Null unless every option has a score: a ranking with a hole in it ranks nothing. Two
 * options at the top score are a tie, and a tie goes to the rules-only pick when it is one of them (else to the
 * earlier option), so the judge never overrides the rules for no stated reason.
 */
export function pickFromScores(result: JudgeResult, options: readonly TurnOption[], rulesOptionId: string | null): JudgedPick | null {
  if (options.length === 0) return null;
  const scores: number[] = [];
  for (let i = 0; i < options.length; i++) {
    const score = scoreOf(result, turnKey(i));
    if (score === null) return null;
    scores.push(score);
  }
  const top = Math.max(...scores);
  const tied = options.filter((_, i) => scores[i] === top);
  const chosen = tied.find((o) => o.id === rulesOptionId) ?? tied[0];
  const answer = result.answers[turnKey(options.indexOf(chosen))];
  return { optionId: chosen.id, confidence: answer && answer.type === "score" && answer.confidence !== undefined ? answer.confidence : null };
}

// ── the note veto ───────────────────────────────────────────────────────────────
//
// The narrow design the #1061 pilot points to: one yes or no per turn, and code decides the rest. Only a creature with
// a note is ever asked, and the model only says whether a turn goes against the note. Which turn is taken is still the
// rules-only `pickTurn`, over the turns the note did not rule out.

export const NOTE_WORDING = "v2";

/** Whole squares between two anchor cells (diagonals count one), so 1 is next to. A Medium footprint is assumed for everyone. */
const squaresApart = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** The names of the creatures standing next to a square (not the mover itself). */
function nextTo(cell: { x: number; y: number } | null | undefined, combatants: readonly RunCombatant[], moverId: string): string[] {
  if (cell === null || cell === undefined) return [];
  return combatants.filter((c) => c.instance_id !== moverId && c.hp > 0 && c.position && squaresApart(c.position, cell) <= 1).map((c) => c.name);
}

export interface NoteTurnFacts extends TurnFacts {
  /** Who is next to the square the creature ends the turn on (everyone, friend or foe). */
  ends_next_to: string[];
  /** Whether the creature leaves the square it stands on. */
  leaves_its_square: boolean;
  /** How far, in feet, the square it ends on is from every other creature still standing. */
  ends_this_far_from: { name: string; feet: number }[];
  /** What a note about a kind of foe turns on: the target's own health, armor class and conditions, and who is beside it. */
  target_health?: string;
  target_armor_class?: string;
  target_conditions?: string[];
  target_next_to?: string[];
}

export interface NoteState {
  creature: { name: string; note: string; starts_next_to: string[]; health: string };
  turns: Record<string, NoteTurnFacts>;
}

function noteStateOf(input: TurnJudgeInput, note: string): NoteState {
  const { mover, combatants, options } = input;
  const names = new Map(combatants.map((c) => [c.instance_id, c.name]));
  const turns: Record<string, NoteTurnFacts> = {};
  options.forEach((option, i) => {
    const end = option.destination === null ? mover.position : option.destination;
    const target = option.targetId === null ? undefined : combatants.find((c) => c.instance_id === option.targetId);
    turns[turnKey(i)] = {
      ...turnFacts(option, names),
      ends_next_to: nextTo(end, combatants, mover.instance_id),
      leaves_its_square: option.feet !== null && option.feet > 0,
      ends_this_far_from: end === null || end === undefined ? [] : combatants.filter((c) => c.instance_id !== mover.instance_id && c.hp > 0 && c.position).map((c) => ({ name: c.name, feet: squaresApart(c.position as { x: number; y: number }, end) * 5 })),
      ...(target === undefined ? {} : { target_health: health(target), target_armor_class: target.ac }),
      ...(target === undefined || target.conditions.length === 0 ? {} : { target_conditions: target.conditions.map((k) => k.name) }),
      ...(target === undefined || !target.position ? {} : { target_next_to: nextTo(target.position, combatants, target.instance_id) }),
    };
  });
  return { creature: { name: mover.name, note, starts_next_to: nextTo(mover.position, combatants, mover.instance_id), health: health(mover) }, turns };
}

/** The wording that goes with `NOTE_WORDING`. */
function noteQuestion(key: string) {
  return {
    type: "noul" as const,
    instructions: `The Dungeon Master wrote a note about how the creature in \`creature\` behaves (\`creature.note\`). Does taking the turn in \`turns.${key}\` go against that note?`,
    criteria: {
      true: "Taking this turn breaks what the note says this creature does or never does.",
      false: "Taking this turn is compatible with the note, or the note says nothing about it.",
    },
  };
}

/**
 * One Noul question per turn: does it go against the creature's note. Null for a creature with no note (the model is
 * never called for it) and when there are fewer than two turns (a lone turn is taken whatever the note says).
 */
export function noteRequest(input: TurnJudgeInput): JudgeRequest | null {
  const note = input.profile.note;
  if (note === null || note.trim().length === 0 || input.options.length < 2) return null;
  const state = noteStateOf(input, note);
  const questions: JudgeRequest["questions"] = {};
  for (const key of Object.keys(state.turns)) questions[key] = noteQuestion(key);
  return { state, questions };
}

/** The probability, per option, that taking it goes against the note; null where the answer is missing. */
export function noteProbabilities(result: JudgeResult, options: readonly TurnOption[]): (number | null)[] {
  return options.map((_, i) => noulOf(result, turnKey(i)));
}

/**
 * The options the note allows: those whose probability of going against it is under `threshold` (a probability at the
 * threshold is ruled out). Every option is returned when any answer is missing (a partial veto is a guess about the
 * rest) and when every option would be ruled out: the note then decides nothing, and the list is never empty.
 */
export function optionsAllowedByNote(result: JudgeResult, options: readonly TurnOption[], threshold: number): TurnOption[] {
  const probabilities = noteProbabilities(result, options);
  if (probabilities.some((p) => p === null)) return [...options];
  const allowed = options.filter((_, i) => (probabilities[i] as number) < threshold);
  return allowed.length === 0 ? [...options] : allowed;
}

// ── the cap ─────────────────────────────────────────────────────────────────────

/**
 * At most this many note judgments a fight. One is asked per turn of a creature that has a note, so a fight of ten
 * rounds with three noted creatures asks 30: a long fight in normal play stays under it, while a client that calls
 * take_turn without end stops here instead of spending without limit.
 */
export const MAX_NOTE_JUDGMENTS_PER_FIGHT = 60;

/** Whether one more judgment may be asked: `made` are the fight's earlier ones, `thisBatch` the ones of the request in hand not yet counted. */
export const underNoteCap = (made: number, thisBatch: number): boolean => made + thisBatch < MAX_NOTE_JUDGMENTS_PER_FIGHT;
