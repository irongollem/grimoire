import { describe, expect, it } from "vitest";
import { boonEntryFor, isBoonSpell } from "./boonEntry";
import { bless, cureWounds, fireball, shieldOfFaith } from "./spellTestKit";

describe("boonEntryFor", () => {
  // PHB "Bless": three creatures, one more per slot level above 1st; a minute (10 rounds), Concentration, an Action.
  // Bug caught: the extra creature per slot never added, or added at the spell's own level.
  it("fails if Bless does not reach three creatures at 1st level and four at 2nd", () => {
    expect(boonEntryFor(bless(), 1)).toEqual({ boonable: true, grants: { attack: "1d4", save: "1d4" }, targetCount: 3, slot: "action", rounds: 10, concentration: true });
    expect(boonEntryFor(bless(), 2)).toMatchObject({ targetCount: 4 });
  });

  // PHB "Shield of Faith": a Bonus Action, +2 AC, one creature at every slot (no extra per slot).
  it("fails if Shield of Faith is not a one-creature Bonus Action boon of +2 AC", () => {
    expect(boonEntryFor(shieldOfFaith(), 3)).toMatchObject({ boonable: true, grants: { ac: 2 }, targetCount: 1, slot: "bonus_action", rounds: 100 });
  });

  // Bug caught: a boon cast with a slot below its level, or one whose dice cannot be rolled, offered as a cast.
  it("fails if a boon is offered below its level or with dice it cannot roll", () => {
    expect(boonEntryFor(bless({ level: 2 }), 1)).toMatchObject({ boonable: false });
    const odd = bless();
    const broken = { ...odd, effects: (odd.effects ?? []).map((e) => ({ ...e, grants: { ...e.grants, attack: "lots", rounds: 10 } })) };
    expect(boonEntryFor(broken, 1)).toMatchObject({ boonable: false });
  });

  // A spell with no `grants` (a damage spell, a heal) is not a boon, whatever its text says. Bug caught: every text effect read as a boon.
  it("fails if a spell with no grants is a boon", () => {
    expect(isBoonSpell(fireball())).toBe(false);
    expect(isBoonSpell(cureWounds())).toBe(false);
    expect(isBoonSpell(bless())).toBe(true);
  });
});
