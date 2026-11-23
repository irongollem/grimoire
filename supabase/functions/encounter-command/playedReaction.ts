// The Reaction the person at the AI table chooses for themselves (#1021, the maintainer's decision of 21 Nov 2026: "Ask with a React card").
// A creature's turn is played in one request, so a moment that is the person's (their Shield, their Counterspell) cannot wait for them
// inside it. The turn is therefore PAUSED: nothing of it is saved, the moment is kept on the fight row (`encounter_state.pending_reaction`),
// and the answer (`answer_reaction`) plays the SAME turn again from the SAME fight with the SAME dice and tactics-judge answers (the "tape"),
// taking the answers in order at each moment of the person's. Pure with the dice injected; `handler.ts` wires it in.
//
// Why a replay and not a saved half-turn: the engine plays a turn as one pure function of the fight, so resuming in the middle would need
// every local of that function saved. Replaying it with the answers it has to give is the same turn by construction, and a fight that
// is never written half-way cannot be left in a state no rule describes.

import { isReactionAnswer, type ReactionAnswer, type ReactionOffer } from "../../../src/rules/fight/reactionOffer.ts";
import type { JudgeResult } from "../_shared/typesafe.ts";
import { FightCommandError } from "./commandError.ts";
import { validateTakeTurnCommand, type TakeTurnCommand } from "./takeTurn.ts";

/** The request type that answers a waiting Reaction. Sent alone. */
export type AnswerReactionCommand = { type: "answer_reaction"; answer: ReactionAnswer };

export function isAnswerReactionCommand(command: { type: string }): command is AnswerReactionCommand {
  return command.type === "answer_reaction";
}

/** Shape only: an answer is `cast` or `pass`. */
export function validateAnswerReactionCommand(command: Record<string, unknown>): void {
  if (!isReactionAnswer(command.answer)) throw new FightCommandError(400, "answer_reaction: answer is \"cast\" or \"pass\".");
}

/** One thing a turn drew from outside the fight, in the order it did: a die, or a tactics-judge answer. */
export type TapeEntry =
  | { fn: "d20" | "d6" | "die"; sides: number; value: number }
  | { fn: "note"; key: string; answer: JudgeResult | null };

/**
 * The turn is stopped at a moment of the person's: this is the offer, thrown from the asker (`askerFor`) and caught only by the handler,
 * outside everything that builds state, so nothing is ever written part-way. Not a `FightCommandError`: it is no refusal.
 */
export class ReactionPause extends Error {
  readonly offer: ReactionOffer;
  constructor(offer: ReactionOffer) {
    super("The turn is waiting for the played character's Reaction.");
    this.name = "ReactionPause";
    this.offer = offer;
  }
}

/** What `encounter_state.pending_reaction` holds (written and read only by `encounter-command`). */
export interface PendingReaction {
  /** The turn that paused, exactly as it was sent (with the played member). */
  command: TakeTurnCommand & { playedMemberId: string };
  /** What the person chose at each moment so far, in order; the replay gives these and pauses at the next moment. */
  answers: ReactionAnswer[];
  /** Every die and judgment the turn drew up to the pause. */
  tape: TapeEntry[];
  /** The moment waiting now: what the page shows. */
  offer: ReactionOffer;
  /** The batch whose answer made `answers` what it is (null for the turn's first pause): a retried send of it re-offers, it does not answer the next moment. */
  answerBatchId: string | null;
}

/**
 * Dice and judgments of one attempt, recorded as they are drawn and, on a replay, answered from what the earlier attempt drew.
 * A call is answered from the tape while it lasts and matches (the same function, the same sides, the same note key, a face the die
 * has); the first call that does not match abandons the rest of the tape, and everything from there is fresh and recorded. Never throws on
 * a mismatch: the fight may have changed under a waiting turn (a character's sheet edited), and fresh dice are what a retry would roll.
 */
export class DiceTape {
  private readonly entries: TapeEntry[];
  private cursor = 0;

  constructor(taped: readonly TapeEntry[] = []) {
    this.entries = [...taped];
  }

  /** The next taped entry when `matches` accepts it; otherwise nothing, and a taped entry that did not match ends the tape there. */
  private serve(matches: (entry: TapeEntry) => boolean): TapeEntry | null {
    if (this.cursor >= this.entries.length) return null;
    const entry = this.entries[this.cursor];
    if (matches(entry)) {
      this.cursor += 1;
      return entry;
    }
    this.entries.length = this.cursor;
    return null;
  }

  private record(entry: TapeEntry): void {
    this.entries.push(entry);
    this.cursor = this.entries.length;
  }

  private die(fn: "d20" | "d6" | "die", sides: number, fresh: () => number): number {
    const taped = this.serve((e) => e.fn === fn && e.sides === sides && Number.isInteger(e.value) && e.value >= 1 && e.value <= sides);
    if (taped !== null && taped.fn !== "note") return taped.value;
    const value = fresh();
    this.record({ fn, sides, value });
    return value;
  }

  /** The three functions every die of an attempt comes from (`BatchDeps`), recorded and replayed. */
  wrap(source: { rollD20(): number; rollD6(): number; rollDie(sides: number): number }): { rollD20(): number; rollD6(): number; rollDie(sides: number): number } {
    return {
      rollD20: () => this.die("d20", 20, () => source.rollD20()),
      rollD6: () => this.die("d6", 6, () => source.rollD6()),
      rollDie: (sides) => this.die("die", sides, () => source.rollDie(sides)),
    };
  }

  /** A tactics-judge answer: from the tape when the same question is next (a refusal too), else asked and recorded. */
  async note(key: string, fresh: () => Promise<JudgeResult | null>): Promise<JudgeResult | null> {
    const taped = this.serve((e) => e.fn === "note" && e.key === key);
    if (taped !== null && taped.fn === "note") return taped.answer;
    const answer = await fresh();
    this.record({ fn: "note", key, answer });
    return answer;
  }

  /** What the attempt drew, for a pause to keep. */
  recorded(): TapeEntry[] {
    return structuredClone(this.entries);
  }

  /**
   * The input tokens of every real judgment the turn used: the ones the pause carried over and the ones asked now. Billed once, at
   * the save that commits the turn; a pause bills nothing, so a turn paused twice is still billed once.
   */
  billedTokens(): number[] {
    return this.entries.flatMap((e) => (e.fn === "note" && e.answer !== null ? [e.answer.inputTokens] : []));
  }
}

/** The person's answers, given in order at the moments of theirs; past the last one the turn pauses at the next moment. */
export function askerFor(answers: readonly ReactionAnswer[]): (offer: ReactionOffer) => ReactionAnswer {
  let next = 0;
  return (offer) => {
    if (next < answers.length) {
      next += 1;
      return answers[next - 1];
    }
    throw new ReactionPause(offer);
  };
}

/** What one attempt of a played turn works with: the tape its dice come from and the answers its moments take. */
export interface PlayedRun {
  tape: DiceTape;
  answers: ReactionAnswer[];
  ask: (offer: ReactionOffer) => ReactionAnswer;
}

export function playedRunOf(answers: readonly ReactionAnswer[], taped: readonly TapeEntry[]): PlayedRun {
  return { tape: new DiceTape(taped), answers: [...answers], ask: askerFor(answers) };
}

export function pendingOf(command: PendingReaction["command"], run: PlayedRun, offer: ReactionOffer, answerBatchId: string | null): PendingReaction {
  return { command, answers: [...run.answers], tape: run.tape.recorded(), offer, answerBatchId };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function isTapeEntry(value: unknown): value is TapeEntry {
  if (!isRecord(value)) return false;
  if (value.fn === "note") {
    const answer = value.answer;
    return typeof value.key === "string"
      && (answer === null || (isRecord(answer) && typeof answer.model === "string" && isRecord(answer.answers) && typeof answer.inputTokens === "number"));
  }
  return (value.fn === "d20" || value.fn === "d6" || value.fn === "die") && Number.isInteger(value.sides) && Number.isInteger(value.value);
}

/**
 * What a jsonb value read back from the fight row is. Null: nothing waits. `"malformed"`: something is stored and it is not a pending
 * reaction this code wrote. The handler refuses every command but End combat and Abandon (which clear the column) for such a fight with a 409
 * that says so, rather than guess at a half-readable turn.
 */
export function parsePendingReaction(value: unknown): PendingReaction | null | "malformed" {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) return "malformed";
  const { command, answers, tape, offer, answerBatchId } = value;
  if (!isRecord(command) || command.type !== "take_turn" || typeof command.playedMemberId !== "string") return "malformed";
  try {
    validateTakeTurnCommand(command);
  } catch {
    return "malformed";
  }
  if (!Array.isArray(answers) || !answers.every(isReactionAnswer)) return "malformed";
  if (!Array.isArray(tape) || !tape.every(isTapeEntry)) return "malformed";
  if (!isRecord(offer) || (offer.kind !== "shield" && offer.kind !== "counterspell") || typeof offer.reactorId !== "string") return "malformed";
  if (answerBatchId !== null && typeof answerBatchId !== "string") return "malformed";
  return { command: command as PendingReaction["command"], answers, tape, offer: offer as unknown as ReactionOffer, answerBatchId };
}
