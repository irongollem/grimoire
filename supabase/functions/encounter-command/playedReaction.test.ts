import { describe, expect, it } from "vitest";
import type { ReactionOffer } from "../../../src/rules/fight/reactionOffer";
import type { JudgeResult } from "../_shared/typesafe";
import { askerFor, DiceTape, parsePendingReaction, pendingOf, playedRunOf, ReactionPause, type PendingReaction, type TapeEntry } from "./playedReaction";

/** A source of dice that counts what it was asked for: a replay must not reach it while the tape lasts. */
function source(faces: number[]) {
  const asked: string[] = [];
  const next = (name: string) => () => {
    asked.push(name);
    const face = faces.shift();
    if (face === undefined) throw new Error("a die the test did not script");
    return face;
  };
  return { asked, deps: { rollD20: next("d20"), rollD6: next("d6"), rollDie: (sides: number) => next(`d${sides}`)() } };
}

const judged = (inputTokens: number): JudgeResult => ({ model: "jev-test", answers: {}, inputTokens });
const OFFER: ReactionOffer = { kind: "shield", reactorId: "tam", attackerId: "wolf", attack: "Bite", roll: { natural: 8, total: 12 }, armorClass: 10, shieldedArmorClass: 15, spell: "Shield", castLevel: 1, spends: "slot" };

describe("DiceTape", () => {
  // A replay throws the dice the first run threw, in order, and only then fresh ones, which are recorded after them.
  // Bug caught: a replay that rolls fresh dice (the hit that was a hit is now a miss, so the answer plays a different turn), or fresh dice that are not appended.
  it("fails if a replay does not answer from the tape in order and then record fresh dice after it", () => {
    const first = source([8, 4]);
    const run1 = new DiceTape().wrap(first.deps);
    expect([run1.rollD20(), run1.rollD6()]).toEqual([8, 4]);
    const taped: TapeEntry[] = [{ fn: "d20", sides: 20, value: 8 }, { fn: "d6", sides: 6, value: 4 }];
    const second = source([17]);
    const tape = new DiceTape(taped);
    const run2 = tape.wrap(second.deps);
    expect([run2.rollD20(), run2.rollD6(), run2.rollDie(20)]).toEqual([8, 4, 17]);
    expect(second.asked).toEqual(["d20"]);
    expect(tape.recorded()).toEqual([...taped, { fn: "die", sides: 20, value: 17 }]);
  });

  // A taped d20 is not a taped rollDie(20) or a d8: asked for something else, the tape is abandoned from there (everything after it too) and the dice are fresh. Never throws.
  // Bug caught: a mismatched replay served a die of another size (a d6 face of 6 for a d20), or a throw that turned a changed fight into a 500.
  it("fails if a call that does not match the tape is served from it, or the rest of the tape is kept after it", () => {
    const taped: TapeEntry[] = [{ fn: "d20", sides: 20, value: 8 }, { fn: "die", sides: 6, value: 4 }, { fn: "die", sides: 20, value: 9 }];
    const src = source([3, 15, 16]);
    const tape = new DiceTape(taped);
    const run = tape.wrap(src.deps);
    expect(run.rollD20()).toBe(8);
    // The tape's next is a d6 by `rollDie`; the attempt asks for an 8-sided die: fresh, and the taped 4 and 9 are gone.
    expect(run.rollDie(8)).toBe(3);
    expect(run.rollDie(6)).toBe(15);
    expect(run.rollDie(20)).toBe(16);
    expect(src.asked).toEqual(["d8", "d6", "d20"]);
    expect(tape.recorded()).toEqual([{ fn: "d20", sides: 20, value: 8 }, { fn: "die", sides: 8, value: 3 }, { fn: "die", sides: 6, value: 15 }, { fn: "die", sides: 20, value: 16 }]);
  });

  // A taped face the die cannot show (a tape written by something else, or edited) is no answer.
  // Bug caught: a 25 served for a d20.
  it("fails if a taped face outside the die's range is served", () => {
    const src = source([7]);
    const run = new DiceTape([{ fn: "d20", sides: 20, value: 25 }]).wrap(src.deps);
    expect(run.rollD20()).toBe(7);
  });

  // The judgments ride the tape too, a refusal (null) included, so a replay asks the model nothing it already asked.
  // Bug caught: a replay that buys the same judgment again.
  it("fails if a taped judgment, or a taped refusal, is asked of the model again", async () => {
    const answer = judged(321);
    const tape = new DiceTape([{ fn: "note", key: "wolf|a", answer }, { fn: "note", key: "wolf|b", answer: null }]);
    let asked = 0;
    const model = async () => { asked += 1; return judged(5); };
    expect(await tape.note("wolf|a", model)).toBe(answer);
    expect(await tape.note("wolf|b", model)).toBeNull();
    expect(asked).toBe(0);
    // Another question is fresh and recorded.
    expect((await tape.note("wolf|c", model))?.inputTokens).toBe(5);
    expect(asked).toBe(1);
  });

  // The cost: every real judgment the turn used counts once (the ones a pause carried and the ones asked now), a refusal costs nothing.
  // Bug caught: a billed refusal, or judgments dropped from the bill when the turn is the replay's.
  it("fails if the billed tokens leave out a carried judgment or bill a refusal", async () => {
    const tape = new DiceTape([{ fn: "note", key: "a", answer: judged(300) }, { fn: "note", key: "b", answer: null }]);
    await tape.note("a", async () => judged(1));
    await tape.note("b", async () => judged(1));
    await tape.note("c", async () => judged(21));
    expect(tape.billedTokens()).toEqual([300, 21]);
  });

  // A judgment asked in the paused run and not asked again by the replay (the fight changed) is not billed: only what the turn used is.
  // Bug caught: a judgment the final turn never used still billed.
  it("fails if a judgment the replay no longer asks for is still billed", async () => {
    const tape = new DiceTape([{ fn: "note", key: "old", answer: judged(300) }]);
    await tape.note("new", async () => judged(21));
    expect(tape.billedTokens()).toEqual([21]);
  });
});

describe("askerFor", () => {
  // The answers are given in order, one per moment, and the first moment past them pauses with that moment's offer.
  // Bug caught: answers handed out in the wrong order, or a moment with no answer decided silently.
  it("fails if answers are not taken in order or a moment with none does not pause with its offer", () => {
    const ask = askerFor(["pass", "cast"]);
    expect(ask(OFFER)).toBe("pass");
    expect(ask(OFFER)).toBe("cast");
    expect(() => ask(OFFER)).toThrow(ReactionPause);
    try {
      ask(OFFER);
    } catch (e) {
      expect((e as ReactionPause).offer).toBe(OFFER);
    }
  });
});

describe("parsePendingReaction", () => {
  const good = (): PendingReaction => pendingOf(
    { type: "take_turn", instanceId: "wolf", playedMemberId: "pm-tam" },
    playedRunOf(["pass"], [{ fn: "d20", sides: 20, value: 8 }]), OFFER, "a1",
  );

  // What the column holds comes back as what was written; an empty column is "nothing waits".
  // Bug caught: a stored pending that does not survive the jsonb round trip, or an empty column read as a problem.
  it("fails if a pending reaction does not read back as written, or null is not nothing", () => {
    expect(parsePendingReaction(JSON.parse(JSON.stringify(good())))).toEqual(good());
    expect(parsePendingReaction(null)).toBeNull();
    expect(parsePendingReaction(undefined)).toBeNull();
  });

  // Anything else is "malformed", which the handler refuses with a 409 rather than replay.
  // Bug caught: a half-readable pending replayed as a turn (a command that is not a take_turn, no played member, an answer that is not cast or pass, a tape entry of no kind).
  it.each([
    ["not an object", "x"],
    ["a command that is not a take_turn", { ...good(), command: { type: "next_turn" } }],
    ["a take_turn with no played member", { ...good(), command: { type: "take_turn", instanceId: "wolf" } }],
    ["a take_turn with no creature", { ...good(), command: { type: "take_turn", playedMemberId: "pm-tam" } }],
    ["an answer that is not cast or pass", { ...good(), answers: ["maybe"] }],
    ["answers that are not a list", { ...good(), answers: "cast" }],
    ["a tape entry of no kind", { ...good(), tape: [{ fn: "coin", sides: 2, value: 1 }] }],
    ["a taped note with no key", { ...good(), tape: [{ fn: "note", answer: null }] }],
    ["an offer of no kind", { ...good(), offer: { reactorId: "tam" } }],
    ["a batch id that is not text", { ...good(), answerBatchId: 4 }],
  ])("fails if a pending with %s is read as valid", (_why, value) => {
    expect(parsePendingReaction(value)).toBe("malformed");
  });
});
