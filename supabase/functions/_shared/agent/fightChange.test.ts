import { describe, expect, it } from "vitest";
import { budgetLine, cannotAttempt, MAX_DAMAGE, parseFightChange, type TurnBudget } from "./fightChange";
import type { FightState } from "./fight";

const fight = (over: Partial<FightState> = {}): FightState => ({
  encounterId: "e1",
  name: "The Watching Pack",
  phase: "running",
  round: 2,
  fighters: [
    { name: "Rosie", side: "party", hp: 40, maxHp: 58 },
    { name: "Spun Glass Hound 1", side: "enemy", hp: 9, maxHp: 16 },
    { name: "Spun Glass Hound 2", side: "enemy", hp: 0, maxHp: 16 },
  ],
  ...over,
});
const budget = (over: Partial<TurnBudget> = {}): TurnBudget => ({ yours: true, action: true, bonus: true, reaction: true, words: true, ...over });
const blanket = { costs: "action", condition: { target: "spun glass hound 1", name: "Blinded" } };

describe("parseFightChange", () => {
  it("takes a condition on a listed foe, by its listed name, for one round unless told longer", () => {
    expect(parseFightChange(fight(), budget(), blanket, { player: true, byNarrator: false })).toEqual({
      ok: true,
      value: { costs: "action", condition: { target: "Spun Glass Hound 1", name: "Blinded", rounds: 1 }, damage: null, ends: null },
    });
  });

  // Bug caught: a second stunt in a turn whose Action already went on an attack (the turn pays for board and story alike).
  it("refuses a change that costs an Action the turn no longer holds, and takes one that costs nothing", () => {
    expect(parseFightChange(fight(), budget({ action: false }), blanket, { player: true, byNarrator: false }).ok).toBe(false);
    expect(parseFightChange(fight(), budget({ action: false }), { costs: "nothing", ends: "they_give_in" }, { player: true, byNarrator: false }).ok).toBe(true);
  });

  // Bug caught: the player acting through the Dungeon Master in the middle of the creatures' turns.
  it("lets only a Reaction be spent when it is not the player's turn", () => {
    expect(parseFightChange(fight(), budget({ yours: false }), blanket, { player: true, byNarrator: false }).ok).toBe(false);
    expect(parseFightChange(fight(), budget({ yours: false }), { ...blanket, costs: "reaction" }, { player: true, byNarrator: false }).ok).toBe(true);
    expect(parseFightChange(fight(), budget({ yours: false, reaction: false }), { ...blanket, costs: "reaction" }, { player: true, byNarrator: false }).ok).toBe(false);
  });

  // Bug caught: the narrator healing or hurting the player's own character, or beating a fallen creature again.
  it.each([
    ["the player's own character", { costs: "action", damage: { target: "Rosie", amount: 5 } }],
    ["a creature that is already down", { costs: "action", damage: { target: "Spun Glass Hound 2", amount: 5 } }],
    ["someone who is not in the fight", { costs: "action", damage: { target: "Master Floret", amount: 5 } }],
  ])("refuses to change %s", (_what, input) => {
    expect(parseFightChange(fight(), budget(), input, { player: true, byNarrator: false }).ok).toBe(false);
  });

  // Bug caught: a stunt taking a creature out of the fight outright, or dealing whatever number the model typed.
  it("refuses a condition a stunt cannot give, and damage outside its range", () => {
    expect(parseFightChange(fight(), budget(), { costs: "action", condition: { target: "Spun Glass Hound 1", name: "Paralyzed" } }, { player: true, byNarrator: false }).ok).toBe(false);
    expect(parseFightChange(fight(), budget(), { costs: "action", damage: { target: "Spun Glass Hound 1", amount: MAX_DAMAGE + 1 } }, { player: true, byNarrator: false }).ok).toBe(false);
    expect(parseFightChange(fight(), budget(), { costs: "action", damage: { target: "Spun Glass Hound 1", amount: 0 } }, { player: true, byNarrator: false }).ok).toBe(false);
    expect(parseFightChange(fight(), budget(), { costs: "action", damage: { target: "Spun Glass Hound 1", amount: MAX_DAMAGE } }, { player: true, byNarrator: false }).ok).toBe(true);
  });

  it("refuses a change that changes nothing, and any change when no fight is being fought", () => {
    expect(parseFightChange(fight(), budget(), { costs: "action" }, { player: true, byNarrator: false }).ok).toBe(false);
    expect(parseFightChange(null, budget(), blanket, { player: true, byNarrator: false }).ok).toBe(false);
    expect(parseFightChange(fight({ phase: "over" }), budget(), blanket, { player: true, byNarrator: false }).ok).toBe(false);
    expect(parseFightChange(fight({ phase: "waiting" }), budget(), blanket, { player: true, byNarrator: false }).ok).toBe(false);
  });

  it("ends the fight in one of the three ways and no other", () => {
    expect(parseFightChange(fight(), budget(), { costs: "action", ends: "you_get_away" }, { player: true, byNarrator: false })).toMatchObject({ ok: true, value: { ends: "you_get_away" } });
    expect(parseFightChange(fight(), budget(), { costs: "action", ends: "everyone_dies" }, { player: true, byNarrator: false }).ok).toBe(false);
  });
});

describe("nothing is done to a creature without the player's roll", () => {
  // Bug caught live (17 Nov 2026): "i try to overpower the last spunhound by pinning it down" was answered with the
  // hound Grappled and no roll at all; asked about it, the narrator agreed it had skipped the check.
  it("refuses a change on a turn that carries no roll, and tells the narrator to ask for one", () => {
    const out = parseFightChange(fight(), budget(), blanket, { player: null, byNarrator: false });
    expect(out).toMatchObject({ ok: false });
    expect(out.ok === false && out.error).toContain("ask_roll");
  });

  // Bug caught: a failed grapple still pinning the hound, or a failed attempt costing the turn nothing.
  it("does nothing to the creature when the roll failed, and still charges the turn", () => {
    expect(parseFightChange(fight(), budget(), blanket, { player: false, byNarrator: false })).toEqual({ ok: true, value: { costs: "action", condition: null, damage: null, ends: null } });
    expect(parseFightChange(fight(), budget(), { costs: "nothing", ends: "they_give_in" }, { player: false, byNarrator: false }).ok).toBe(false);
  });
});

describe("when the creature is the one who rolls", () => {
  const sand = { costs: "action", condition: { target: "Spun Glass Hound 1", name: "Blinded" } };

  // Maintainer, 17 Nov 2026: "some spells though force the roll on the receiver rather the offender".
  // SRD 5.1 "Saving Throws": the save succeeds when its total equals or exceeds the DC.
  it("changes the fight when the creature's save falls short, and not when it meets the DC", () => {
    const rolled = { player: null, byNarrator: true };
    expect(parseFightChange(fight(), budget(), { ...sand, their_save: { total: 11, dc: 12 } }, rolled)).toMatchObject({ ok: true, value: { condition: { name: "Blinded" } } });
    expect(parseFightChange(fight(), budget(), { ...sand, their_save: { total: 12, dc: 12 } }, rolled)).toEqual({
      ok: true,
      value: { costs: "action", condition: null, damage: null, ends: null },
    });
  });

  // Bug caught: a save the narrator only claims to have rolled, with a total it made up.
  it("refuses a save that was not rolled with the roll tool this turn", () => {
    const out = parseFightChange(fight(), budget(), { ...sand, their_save: { total: 3, dc: 12 } }, { player: null, byNarrator: false });
    expect(out.ok).toBe(false);
  });

  it("refuses a save without both numbers", () => {
    expect(parseFightChange(fight(), budget(), { ...sand, their_save: { total: 3 } }, { player: null, byNarrator: true }).ok).toBe(false);
  });
});

describe("cannotAttempt", () => {
  // Bug caught live (17 Nov 2026): asked for Persuasion with the Action already spent, the player rolled a 15 and
  // was then told the attempt could not be made.
  it("says no before any roll when the turn has neither an Action nor a Bonus Action left", () => {
    expect(cannotAttempt(budget({ action: false, bonus: false }))).toContain("Ask for no roll");
    expect(cannotAttempt(budget({ action: false }))).toBeNull();
    expect(cannotAttempt(budget())).toBeNull();
  });

  it("lets a Reaction pay off the player's turn, and nothing else", () => {
    expect(cannotAttempt(budget({ yours: false }))).toBeNull();
    expect(cannotAttempt(budget({ yours: false, reaction: false }))).toContain("not the player's turn");
  });

  it("does not hold back a roll when the page did not say what the turn holds", () => {
    expect(cannotAttempt(null)).toBeNull();
  });
});

describe("budgetLine", () => {
  it("tells the narrator what the turn still holds", () => {
    expect(budgetLine(budget({ action: false }))).toBe("It is the player's turn. It still holds: Bonus Action, Reaction, a few words.");
  });

  it("says so when it is not the player's turn", () => {
    expect(budgetLine(budget({ yours: false }))).toContain("not the player's turn");
  });
});
