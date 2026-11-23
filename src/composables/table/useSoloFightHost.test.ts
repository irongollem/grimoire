import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, reactive, ref } from "vue";
import type { TurnRun } from "@/composables/encounters/useFightCommands";
import { FightRequestError } from "@/lib/encounters/fightWire";
import type { ReactionAnswer, ShieldOffer } from "@/rules/fight/reactionOffer";
import { playTurnAnswering, ReactionAnswerFailed, useSoloFightHost } from "./useSoloFightHost";

// The host's own collaborators: the one run store (a plain reactive object with what the host reads), the fight's commands, the ruleset.
const fakes = vi.hoisted(() => ({
  store: null as unknown as Record<string, unknown>,
  fight: null as unknown as { takeTurn: ReturnType<typeof vi.fn>; answerReaction: ReturnType<typeof vi.fn> },
}));
vi.mock("@/stores/encounterRun", () => ({ useEncounterRunStore: () => fakes.store }));
vi.mock("@/composables/encounters/useFightCommands", () => ({ useFightCommands: () => fakes.fight }));
vi.mock("@/composables/rules/useRuleset", () => ({ useTableRuleset: () => ({ ruleset: ref("2014") }) }));

const offer: ShieldOffer = { kind: "shield", reactorId: "me", attackerId: "orc", attack: "Greataxe", roll: { natural: 14, total: 19 }, armorClass: 16, shieldedArmorClass: 21, spell: "Shield", castLevel: 1, spends: "slot" };
const paused = (o: ShieldOffer = offer, id = "offer-1"): TurnRun => ({ turn: null, outcomes: [], provokedPlayer: [], reactionOffered: o, reactionOfferId: id });
const done = (): TurnRun => ({ turn: { instanceId: "orc" } as TurnRun["turn"], outcomes: [], provokedPlayer: [], reactionOffered: null, reactionOfferId: null });
const nameOf = (id: string) => ({ me: "Mira", orc: "Orc" })[id] ?? id;

function setup(replies: { start: TurnRun; answers: TurnRun[]; choices?: ReactionAnswer[]; played?: string | null }) {
  const answers = [...replies.answers];
  const choices = [...(replies.choices ?? ["cast"])];
  const calls = { answer: vi.fn(), ask: vi.fn(), lines: vi.fn(), answered: vi.fn() };
  const run = playTurnAnswering({
    start: () => Promise.resolve(replies.start),
    answer: (a, offerId) => { calls.answer(a, offerId); return Promise.resolve(answers.shift()!); },
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
    // The answer names the offer it answers (`offer-1`), not just the choice.
    expect(calls.answer).toHaveBeenCalledWith("cast", "offer-1");
    expect(calls.answered).toHaveBeenCalledTimes(1);
    expect(calls.lines).toHaveBeenCalledWith([{ kind: "margin", text: "Mira casts Shield: armour class 21" }]);
  });

  // Bug caught: a second chance in the same turn ignored, so the turn is read as finished while it is still paused.
  it("asks again when the reply is another offer", async () => {
    const final = done();
    const { run, calls } = setup({ start: paused(), answers: [paused(offer, "offer-2"), final], choices: ["pass", "cast"] });
    expect(await run).toBe(final);
    expect(calls.ask).toHaveBeenCalledTimes(2);
    // Each answer carries the id of the offer it follows, so the second is not the first's.
    expect(calls.answer.mock.calls).toEqual([["pass", "offer-1"], ["cast", "offer-2"]]);
  });

  // Bug caught: an offer meant for another creature put to the person, who would then answer for someone else's spell slot.
  it("does not ask or loop for an offer that is not the played character's", async () => {
    const { run, calls } = setup({ start: paused({ ...offer, reactorId: "ally" }), answers: [] });
    expect(await run).toBeNull();
    expect(calls.ask).not.toHaveBeenCalled();
    expect(calls.answer).not.toHaveBeenCalled();
  });

  // A refusal (the server will answer the same next time) is not an ordinary failure: the creature's turn is not finished, so the caller must be able to tell it apart
  // from "a turn that cannot be run" (which is passed). The card goes, and the error carries the server's sentence.
  // Bugs caught: a refused answer thrown as a plain error (the caller passes the turn while the server still holds the reaction), the card left up with dead buttons.
  it("throws ReactionAnswerFailed, with the server's sentence, for an answer the server refused", async () => {
    const answered = vi.fn();
    const refused = new FightRequestError("That reaction was already answered; the fight is waiting on a newer one.", 409);
    const run = playTurnAnswering({ start: () => Promise.resolve(paused()), answer: () => Promise.reject(refused), playedInstanceId: "me", ask: () => Promise.resolve("pass"), answered, onLines: vi.fn(), nameOf });
    await expect(run).rejects.toBeInstanceOf(ReactionAnswerFailed);
    await expect(run).rejects.toThrow("That reaction was already answered");
    expect(answered).toHaveBeenCalledOnce();
  });

  // No connection (or the function failed on its side): the offer is still waiting on the server, so the same card comes back and the player answers again with the same offer id.
  // Bug caught: a lost answer ending the turn (or the card), leaving the fight paused on the server with nobody able to answer it.
  it("asks again with the same offer when the answer could not be sent", async () => {
    const final = done();
    const send = vi.fn().mockRejectedValueOnce(new FightRequestError("offline", null)).mockResolvedValueOnce(final);
    const ask = vi.fn().mockResolvedValueOnce("cast").mockResolvedValueOnce("cast");
    const answered = vi.fn();
    const lines = vi.fn();
    const run = playTurnAnswering({ start: () => Promise.resolve(paused()), answer: send, playedInstanceId: "me", ask, answered, onLines: lines, nameOf });
    expect(await run).toBe(final);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(send.mock.calls).toEqual([["cast", "offer-1"], ["cast", "offer-1"]]);
    expect(answered).toHaveBeenCalledOnce();
    expect(lines).toHaveBeenCalledWith([{ kind: "margin", text: "Your answer did not get through. Try again." }]);
  });

  // The server's reply to an offer must say which offer it is: answering without an id would let any stale card through.
  // Bug caught: an offer with no id answered anyway.
  it("does not answer an offer the reply gave no id for", async () => {
    const send = vi.fn();
    const run = playTurnAnswering({ start: () => Promise.resolve({ ...paused(), reactionOfferId: null }), answer: send, playedInstanceId: "me", ask: () => Promise.resolve("cast"), answered: vi.fn(), onLines: vi.fn(), nameOf });
    await expect(run).rejects.toBeInstanceOf(ReactionAnswerFailed);
    expect(send).not.toHaveBeenCalled();
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

describe("useSoloFightHost: a creature's turn whose reaction answer was refused", () => {
  afterEach(() => vi.useRealTimers());

  // The orc's turn pauses at the person's Shield; the answer is refused (409). The server may still hold the reaction, so the orc's turn must NOT be passed: the loop stops
  // without next_turn (a generic "a turn that cannot be run is a turn passed" would skip it and leave the fight and the server out of step), and the table is told why.
  // Bug caught: a refused answer treated as a finished turn, so the fight moves to the next combatant while the server still waits for the reaction (CodeRabbit on #1261).
  it("fails if a refused answer passes the creature's turn", async () => {
    vi.useFakeTimers();
    const orc = { instance_id: "orc", name: "Orc", type: "monster", hp: 15, max_hp: 15, faction_id: "m", initiative: 15, reveal_state: "revealed" };
    const mira = { instance_id: "me", name: "Mira", type: "player", party_member_id: "pm-mira", hp: 20, max_hp: 20, faction_id: "p", initiative: 5 };
    const store = reactive({
      encounterId: "enc-1", started: true, round: 1, factions: [], rollingInitiative: false, combatants: [orc, mira], sortedCombatants: [orc, mira],
      activeIndex: 0,
      get activeCombatant() { return this.combatants[this.activeIndex]; },
      setRuleset: vi.fn(), setRevealState: vi.fn(), startCombat: vi.fn(), setInitiative: vi.fn(), nextTurn: vi.fn(),
    });
    fakes.store = store as unknown as Record<string, unknown>;
    fakes.fight = {
      takeTurn: vi.fn().mockResolvedValue(paused()),
      answerReaction: vi.fn().mockRejectedValue(new FightRequestError("That reaction was already answered; the fight is waiting on a newer one.", 409)),
    };
    const lines = vi.fn();
    const answered = vi.fn();
    const scope = effectScope();
    scope.run(() =>
      useSoloFightHost({
        encounterId: ref("enc-1"), memberId: () => "pm-mira", onLines: lines, onOver: vi.fn(), onHelperTurn: vi.fn(), onProvoked: vi.fn(),
        onReaction: () => Promise.resolve("cast"), onReactionAnswered: answered, onLost: vi.fn(),
      }),
    );
    for (let i = 0; i < 20; i++) await nextTick();
    await vi.advanceTimersByTimeAsync(10_000);
    scope.stop();
    expect(fakes.fight.answerReaction).toHaveBeenCalledWith("cast", "offer-1");
    expect(answered).toHaveBeenCalledOnce();
    expect(store.nextTurn).not.toHaveBeenCalled();
    expect(lines).toHaveBeenCalledWith([{ kind: "margin", text: "That reaction was already answered; the fight is waiting on a newer one." }]);
  });
});
