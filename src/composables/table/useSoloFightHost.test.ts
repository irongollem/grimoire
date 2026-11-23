import { describe, expect, it, vi } from "vitest";
import type { TurnRun } from "@/composables/encounters/useFightCommands";
import type { ReactionAnswer, ShieldOffer } from "@/rules/fight/reactionOffer";
import { playTurnAnswering } from "./useSoloFightHost";

const offer: ShieldOffer = { kind: "shield", reactorId: "me", attackerId: "orc", attack: "Greataxe", roll: { natural: 14, total: 19 }, armorClass: 16, shieldedArmorClass: 21, spell: "Shield", castLevel: 1, spends: "slot" };
const paused = (o: ShieldOffer = offer): TurnRun => ({ turn: null, outcomes: [], provokedPlayer: [], reactionOffered: o });
const done = (): TurnRun => ({ turn: { instanceId: "orc" } as TurnRun["turn"], outcomes: [], provokedPlayer: [], reactionOffered: null });
const nameOf = (id: string) => ({ me: "Mira", orc: "Orc" })[id] ?? id;

function setup(replies: { start: TurnRun; answers: TurnRun[]; choices?: ReactionAnswer[]; played?: string | null }) {
  const answers = [...replies.answers];
  const choices = [...(replies.choices ?? ["cast"])];
  const calls = { answer: vi.fn(), ask: vi.fn(), lines: vi.fn(), answered: vi.fn() };
  const run = playTurnAnswering({
    start: () => Promise.resolve(replies.start),
    answer: (a) => { calls.answer(a); return Promise.resolve(answers.shift()!); },
    playedInstanceId: replies.played === undefined ? "me" : replies.played,
    ask: (o) => { calls.ask(o); return Promise.resolve(choices.shift()!); },
    answered: calls.answered,
    onLines: calls.lines,
    nameOf,
  });
  return { run, calls };
}

describe("playTurnAnswering", () => {
  // Bug caught: the answer never sent (the fight hangs paused), or the page carrying on with the paused reply (no turn, so the creature "does nothing").
  it("asks the person, sends the answer and returns the reply it brings", async () => {
    const final = done();
    const { run, calls } = setup({ start: paused(), answers: [final] });
    expect(await run).toBe(final);
    expect(calls.ask).toHaveBeenCalledWith(offer);
    expect(calls.answer).toHaveBeenCalledWith("cast");
    expect(calls.answered).toHaveBeenCalledTimes(1);
    expect(calls.lines).toHaveBeenCalledWith([{ kind: "margin", text: "Mira casts Shield: armour class 21" }]);
  });

  // Bug caught: a second chance in the same turn ignored, so the turn is read as finished while it is still paused.
  it("asks again when the reply is another offer", async () => {
    const final = done();
    const { run, calls } = setup({ start: paused(), answers: [paused(), final], choices: ["pass", "cast"] });
    expect(await run).toBe(final);
    expect(calls.ask).toHaveBeenCalledTimes(2);
    expect(calls.answer.mock.calls).toEqual([["pass"], ["cast"]]);
  });

  // Bug caught: an offer meant for another creature put to the person, who would then answer for someone else's spell slot.
  it("does not ask or loop for an offer that is not the played character's", async () => {
    const { run, calls } = setup({ start: paused({ ...offer, reactorId: "ally" }), answers: [] });
    expect(await run).toBeNull();
    expect(calls.ask).not.toHaveBeenCalled();
    expect(calls.answer).not.toHaveBeenCalled();
  });

  // Bug caught: a failed answer swallowed here, so the creature's turn is neither played nor passed with the server's sentence.
  it("lets a failed answer throw to the caller", async () => {
    const answered = vi.fn();
    const run = playTurnAnswering({ start: () => Promise.resolve(paused()), answer: () => Promise.reject(new Error("The fight ended.")), playedInstanceId: "me", ask: () => Promise.resolve("pass"), answered, onLines: vi.fn(), nameOf });
    await expect(run).rejects.toThrow("The fight ended.");
    // Bug caught: the card left on screen, buttons dead, after a refused answer.
    expect(answered).toHaveBeenCalledOnce();
  });

  // Bug caught: a turn with no offer being delayed or altered (a reply with no offer must come straight back, nobody asked).
  it("returns an ordinary turn untouched without asking", async () => {
    const final = done();
    const { run, calls } = setup({ start: final, answers: [] });
    expect(await run).toBe(final);
    expect(calls.ask).not.toHaveBeenCalled();
    expect(calls.lines).not.toHaveBeenCalled();
  });
});
