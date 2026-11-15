import { describe, expect, it } from "vitest";
import type { TacticalProfile } from "../../../src/rules/fight/tactics/profile.ts";
import type { TurnOption } from "../../../src/rules/fight/terrain/turnOptions.ts";
import type { RunCombatant } from "../../../src/types/encounter.types.ts";
import {
  CHOICE_QUESTION,
  choiceRequest,
  howItThinks,
  noteRequest,
  optionsAllowedByNote,
  type NoteState,
  pickFromChoice,
  pickFromScores,
  scoreRequest,
  turnKey,
  type TurnJudgeInput,
  type TurnState,
} from "./tacticsJudge.ts";
import type { JudgeResult } from "./typesafe.ts";

function who(id: string, name: string, faction: string, over: Partial<RunCombatant> = {}): RunCombatant {
  return {
    instance_id: id, type: "monster", name, faction_id: faction, initiative: null, hp: 20, max_hp: 20, ac: "12", conditions: [], curses: [],
    death_saves: { successes: 0, failures: 0 }, dex_mod: 0, position: { x: 0, y: 0 }, size: "medium", ...over,
  };
}

// oxlint-disable-next-line unicorn/no-thenable -- `then` is the stat block's own morale field (#1203), not a promise
const morale = (breaksAt: number, then: TacticalProfile["morale"]["then"]): TacticalProfile["morale"] => ({ breaksAt, then });

const profile = (over: Partial<TacticalProfile> = {}): TacticalProfile => ({
  tier: "trained", role: "brute", targets: "most_wounded", morale: morale(0.25, "flee"), cover: "when_cheap", offers: new Set(["attack", "dodge"]), note: null, ...over,
});

function option(id: string, over: Partial<TurnOption> = {}): TurnOption {
  return {
    id, kind: "attack", targetId: "fresco", destination: null, path: null, feet: null, attack: null, distanceFeet: null, provokes: [], exposure: [], summary: `summary of ${id}`, ...over,
  };
}
const attackOption = (id: string, over: Partial<TurnOption> = {}) =>
  option(id, {
    attack: { list: "actions", action: "Club", steps: null, distanceFeet: 5, cover: "none", longRange: false, closeCombat: false, hitChance: 0.65, expectedDamage: 9.04 },
    ...over,
  });

const OGRE = who("ogre", "Ogre", "m", { hp: 9, max_hp: 30 });
const FRESCO = who("fresco", "Fresco", "p", { hp: 12, max_hp: 20, concentration: { spellId: null, spellName: "Bless", castAtLevel: 1, startedRound: 1, appliedEffectIds: [] } });
const CHICORY = who("chicory", "Chicory", "p", { conditions: [{ name: "Prone" }] });
const DEAD = who("dead", "Corpse", "p", { hp: 0 });
const FRIEND = who("friend", "Ogre Friend", "m");

const OPTIONS = [attackOption("attack:actions:Club:fresco"), option("dodge", { kind: "dodge", targetId: null }), option("flee", { kind: "flee", targetId: null })];

const input = (over: Partial<TurnJudgeInput> = {}): TurnJudgeInput => ({
  mover: OGRE, profile: profile(), combatants: [OGRE, FRESCO, CHICORY, DEAD, FRIEND], options: OPTIONS, ...over,
});
const stateOf = (r: ReturnType<typeof choiceRequest>): TurnState => (r as { state: TurnState }).state;

describe("the request: what the judge is shown", () => {
  it("holds every gated option exactly once, in its own question or its own turn (an option dropped, or listed twice, skews the pick)", () => {
    const choice = choiceRequest(input());
    expect(Object.keys(stateOf(choice).turns)).toEqual(["turn_1", "turn_2", "turn_3"]);
    const q = choice?.questions[CHOICE_QUESTION];
    expect(q?.type === "choice" ? Object.keys(q.criteria) : []).toEqual(["turn_1", "turn_2", "turn_3"]);
    const score = scoreRequest(input());
    expect(Object.keys(score?.questions ?? {})).toEqual(["turn_1", "turn_2", "turn_3"]);
    expect(Object.keys(stateOf(score).turns)).toEqual(["turn_1", "turn_2", "turn_3"]);
  });

  it("says nothing about an option the gate dropped: only the options passed in are described", () => {
    const hidden = option("hide", { kind: "hide", targetId: null, summary: "Hide behind the pillar" });
    const json = JSON.stringify([choiceRequest(input()), scoreRequest(input())]);
    expect(json).not.toContain(hidden.summary);
    expect(JSON.stringify(choiceRequest(input({ options: [...OPTIONS, hidden] })))).toContain(hidden.summary);
  });

  it("carries the note word for word, and a null note as null rather than as an empty line", () => {
    const note = "Guards the door and never leaves it.";
    expect(stateOf(choiceRequest(input({ profile: profile({ note }) }))).creature.note).toBe(note);
    expect(stateOf(scoreRequest(input({ profile: profile({ note }) }))).creature.note).toBe(note);
    expect(stateOf(choiceRequest(input())).creature.note).toBeNull();
  });

  it("states hit points as plain 'N of M' for the creature and everyone else, and who holds a spell or lies prone", () => {
    const s = stateOf(choiceRequest(input()));
    expect(s.creature.health).toBe("9 of 30 hit points (30 percent)");
    expect(s.enemies.find((e) => e.name === "Fresco")).toEqual({ name: "Fresco", health: "12 of 20 hit points (60 percent)", holding_a_spell: true });
    expect(s.enemies.find((e) => e.name === "Chicory")?.conditions).toEqual(["Prone"]);
  });

  it("lists living enemies and allies apart, and neither the mover among its own allies nor the dead among its enemies", () => {
    const s = stateOf(choiceRequest(input()));
    expect(s.enemies.map((e) => e.name)).toEqual(["Fresco", "Chicory"]);
    expect(s.allies.map((e) => e.name)).toEqual(["Ogre Friend"]);
  });

  it("states the numbers code worked out (rounded for reading) and leaves arithmetic out of the question", () => {
    const turn = stateOf(choiceRequest(input())).turns.turn_1;
    expect(turn).toMatchObject({ hit_chance_percent: 65, expected_damage: 9, target: "Fresco" });
    const q = choiceRequest(input())?.questions[CHOICE_QUESTION];
    expect(q?.type === "choice" ? q.criteria.turn_1 : "").toContain("Chance to hit 65 percent, about 9 damage");
  });

  it("names the enemies whose opportunity attacks a turn provokes and the cover its target has, only when there is any", () => {
    const o = attackOption("a", { provokes: [{ enemyId: "chicory", step: 0 }], attack: { ...(attackOption("a").attack as NonNullable<TurnOption["attack"]>), cover: "three_quarters" } });
    const turn = stateOf(choiceRequest(input({ options: [o, OPTIONS[1]] }))).turns.turn_1;
    expect(turn.provokes_opportunity_attacks_from).toEqual(["Chicory"]);
    expect(turn.target_has_cover).toBe("three-quarters");
    expect(stateOf(choiceRequest(input())).turns.turn_1.provokes_opportunity_attacks_from).toBeUndefined();
  });

  it("asks nothing when there is a single turn or none: there is nothing to judge, and the rules keep the pick", () => {
    expect(choiceRequest(input({ options: [OPTIONS[0]] }))).toBeNull();
    expect(scoreRequest(input({ options: [] }))).toBeNull();
  });

  it("describes how the creature thinks from its profile, one sentence per rule, so a creature that never breaks is told so", () => {
    const text = howItThinks(profile({ tier: "instinct", morale: morale(0, "fight_on") })).join(" ");
    expect(text).toContain("never breaks");
    expect(howItThinks(profile({ morale: morale(0.5, "surrender") })).join(" ")).toContain("surrenders when reduced to 50 percent");
  });
});

const choiceResult = (choice: string, confidence = 0.8): JudgeResult => ({
  model: "jev-test", inputTokens: 0, answers: { [CHOICE_QUESTION]: { type: "choice", choice, confidence, probabilities: { [choice]: confidence } } },
});
const scoreResult = (scores: Record<string, number>): JudgeResult => ({
  model: "jev-test", inputTokens: 0, answers: Object.fromEntries(Object.entries(scores).map(([k, score]) => [k, { type: "score" as const, score }])),
});

describe("pickFromChoice", () => {
  it("maps the named turn back to its option id, with the model's confidence", () => {
    expect(pickFromChoice(choiceResult(turnKey(1), 0.7), OPTIONS)).toEqual({ optionId: "dodge", confidence: 0.7 });
  });

  it("is null when the answer is absent, so the caller keeps the rules pick", () => {
    expect(pickFromChoice({ model: "m", inputTokens: 0, answers: {} }, OPTIONS)).toBeNull();
  });

  it("is null when the answer is not a Choice (a Score under the same name must not be read as one)", () => {
    expect(pickFromChoice({ model: "m", inputTokens: 0, answers: { [CHOICE_QUESTION]: { type: "score", score: 3 } } }, OPTIONS)).toBeNull();
  });

  it("is null when the answer names a turn that is not on the list (one more than there are options)", () => {
    expect(pickFromChoice(choiceResult(turnKey(3)), OPTIONS)).toBeNull();
    expect(pickFromChoice(choiceResult("flee"), OPTIONS)).toBeNull();
  });
});

describe("pickFromScores", () => {
  it("takes the highest score, wherever it sits in the list", () => {
    expect(pickFromScores(scoreResult({ turn_1: 2, turn_2: 3, turn_3: 5 }), OPTIONS, "dodge")?.optionId).toBe("flee");
  });

  it("breaks a tie at the top in favour of the rules pick, not the first listed", () => {
    expect(pickFromScores(scoreResult({ turn_1: 4, turn_2: 4, turn_3: 1 }), OPTIONS, "dodge")?.optionId).toBe("dodge");
  });

  it("breaks a tie at the top by list order when the rules pick is not among the tied turns", () => {
    expect(pickFromScores(scoreResult({ turn_1: 1, turn_2: 4, turn_3: 4 }), OPTIONS, OPTIONS[0].id)?.optionId).toBe("dodge");
  });

  it("is null when any turn has no score: a ranking with a hole in it ranks nothing", () => {
    expect(pickFromScores(scoreResult({ turn_1: 2, turn_3: 5 }), OPTIONS, null)).toBeNull();
  });

  it("is null for an empty list rather than a pick from nothing", () => {
    expect(pickFromScores(scoreResult({}), [], null)).toBeNull();
  });

  it("is not fooled by a Choice answer under a turn's name (only a Score is a score)", () => {
    const mixed: JudgeResult = { model: "m", inputTokens: 0, answers: { turn_1: { type: "choice", choice: "x", confidence: 1, probabilities: {} }, turn_2: { type: "score", score: 3 }, turn_3: { type: "score", score: 1 } } };
    expect(pickFromScores(mixed, OPTIONS, null)).toBeNull();
  });

  it("returns the model's own confidence for the picked turn when it gave one, else null", () => {
    const answers: JudgeResult["answers"] = { turn_1: { type: "score", score: 1 }, turn_2: { type: "score", score: 5, confidence: 0.9 }, turn_3: { type: "score", score: 2 } };
    expect(pickFromScores({ model: "m", inputTokens: 0, answers }, OPTIONS, null)).toEqual({ optionId: "dodge", confidence: 0.9 });
    expect(pickFromScores(scoreResult({ turn_1: 1, turn_2: 5, turn_3: 2 }), OPTIONS, null)?.confidence).toBeNull();
  });
});

describe("noteRequest", () => {
  const noted = (note: string | null, over: Partial<TurnJudgeInput> = {}) => input({ profile: profile({ note }), ...over });
  const withPlaces = [who("ogre", "Ogre", "m", { position: { x: 0, y: 0 } }), who("fresco", "Fresco", "p", { position: { x: 1, y: 0 } }), who("chicory", "Chicory", "p", { position: { x: 5, y: 0 } })];

  it("never asks about a creature with no note (a model call there is spend for nothing), nor about a blank one", () => {
    expect(noteRequest(noted(null))).toBeNull();
    expect(noteRequest(noted("   "))).toBeNull();
  });

  it("asks nothing when there is a lone turn: it is taken whatever the note says", () => {
    expect(noteRequest(noted("Guards the door.", { options: [OPTIONS[0]] }))).toBeNull();
  });

  it("asks one yes or no per gated turn, each a Noul, and states the note verbatim", () => {
    const note = "Guards the door and never leaves it.";
    const r = noteRequest(noted(note));
    expect(Object.keys(r?.questions ?? {})).toEqual(["turn_1", "turn_2", "turn_3"]);
    expect(Object.values(r?.questions ?? {}).every((q) => q.type === "noul")).toBe(true);
    expect(r === null ? null : (r.state as NoteState).creature.note).toBe(note);
  });

  it("states who the creature stands next to and who each turn ends beside, so a note about a place or a person can be read", () => {
    const move = attackOption("go", { destination: { x: 4, y: 0 }, feet: 20 });
    const stay = attackOption("stay", { destination: { x: 0, y: 0 }, feet: 0 });
    const s = noteRequest(noted("x", { combatants: withPlaces, options: [move, stay] }))?.state as NoteState;
    expect(s.creature.starts_next_to).toEqual(["Fresco"]);
    expect(s.turns.turn_1).toMatchObject({ ends_next_to: ["Chicory"], leaves_its_square: true });
    expect(s.turns.turn_2).toMatchObject({ ends_next_to: ["Fresco"], leaves_its_square: false });
  });
});

describe("noteRequest: what a note about a person or a distance turns on", () => {
  it("states the target's health, armor class, conditions and neighbours, and the feet from the end square to everyone, so 'never strikes the helpless' and 'stays within ten feet of the shaman' can be read", () => {
    const people = [who("ogre", "Ogre", "m", { position: { x: 0, y: 0 } }), who("fresco", "Fresco", "p", { hp: 5, ac: "15", conditions: [{ name: "Unconscious" }], position: { x: 1, y: 0 } }), who("orsk", "Shaman Orsk", "m", { position: { x: 0, y: 3 } })];
    const stay = attackOption("stay", { destination: { x: 0, y: 0 }, feet: 0 });
    const s = noteRequest(input({ profile: profile({ note: "n" }), combatants: people, options: [stay, OPTIONS[1]] }))?.state as NoteState;
    expect(s.turns.turn_1).toMatchObject({ target_health: "5 of 20 hit points (25 percent)", target_armor_class: "15", target_conditions: ["Unconscious"], target_next_to: ["Ogre"] });
    expect(s.turns.turn_1.ends_this_far_from).toEqual([{ name: "Fresco", feet: 5 }, { name: "Shaman Orsk", feet: 15 }]);
  });
});

describe("optionsAllowedByNote", () => {
  const noul = (probs: Record<string, number>): JudgeResult => ({
    model: "m", inputTokens: 0, answers: Object.fromEntries(Object.entries(probs).map(([k, noul]) => [k, { type: "noul" as const, noul }])),
  });
  const ids = (r: ReturnType<typeof optionsAllowedByNote>) => r.map((o) => o.id);

  it("rules out a turn whose chance of going against the note is over the threshold, so it can never be picked from what is left", () => {
    expect(ids(optionsAllowedByNote(noul({ turn_1: 0.9, turn_2: 0.1, turn_3: 0.2 }), OPTIONS, 0.5))).toEqual(["dodge", "flee"]);
  });

  it("rules out a probability exactly at the threshold and keeps one just under it", () => {
    expect(ids(optionsAllowedByNote(noul({ turn_1: 0.5, turn_2: 0.49, turn_3: 0.1 }), OPTIONS, 0.5))).toEqual(["dodge", "flee"]);
  });

  it("keeps every turn when one answer is missing: a partial veto is a guess about the rest", () => {
    expect(ids(optionsAllowedByNote(noul({ turn_1: 0.9, turn_3: 0.9 }), OPTIONS, 0.5))).toEqual(ids(OPTIONS));
  });

  it("keeps every turn when a Noul is missing because the answer is another type", () => {
    const wrong: JudgeResult = { model: "m", inputTokens: 0, answers: { turn_1: { type: "score", score: 5 }, turn_2: { type: "noul", noul: 0.9 }, turn_3: { type: "noul", noul: 0.9 } } };
    expect(ids(optionsAllowedByNote(wrong, OPTIONS, 0.5))).toEqual(ids(OPTIONS));
  });

  it("keeps every turn when all of them are ruled out, never returning an empty list", () => {
    expect(ids(optionsAllowedByNote(noul({ turn_1: 0.9, turn_2: 0.8, turn_3: 0.7 }), OPTIONS, 0.5))).toEqual(ids(OPTIONS));
  });

  it("keeps the order of the options it keeps", () => {
    expect(ids(optionsAllowedByNote(noul({ turn_1: 0.1, turn_2: 0.9, turn_3: 0.1 }), OPTIONS, 0.5))).toEqual(["attack:actions:Club:fresco", "flee"]);
  });
});
