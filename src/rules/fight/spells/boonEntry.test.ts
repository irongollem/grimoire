import { describe, expect, it } from "vitest";
import { boonEntryFor, isBoonSpell, reactionBoonFor } from "./boonEntry";
import { bless, cureWounds, fireball, shield, shieldOfFaith } from "./spellTestKit";

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

describe("reactionBoonFor", () => {
  // PHB 2014 and 2024 "Shield": a Reaction, +5 to AC. Bug caught: the +5 lost, or the spell read as a turn's cast (a boon cast with the Action).
  it("fails if Shield is not a +5 AC reaction boon that a turn's cast still refuses", () => {
    expect(reactionBoonFor(shield(), 1)).toEqual({ grants: { ac: 5 } });
    expect(boonEntryFor(shield(), 1)).toMatchObject({ boonable: false });
  });

  // Bug caught: a reaction boon read off any boon (Shield of Faith, an Action spell, a spell with no trigger) so a fight casts it when hit.
  it("fails if a boon that is not a Reaction taken when hit is read as one", () => {
    expect(reactionBoonFor(shieldOfFaith(), 1)).toBeNull();
    expect(reactionBoonFor(shield({ casting_time: "Action" }), 1)).toBeNull();
    const noTrigger = shield();
    expect(reactionBoonFor({ ...noTrigger, effects: (noTrigger.effects ?? []).map((e) => ({ ...e, grants: { ac: 5, rounds: 1 } })) }, 1)).toBeNull();
  });

  // PHB 2014 ch. 10 "Spell Slots": a spell is cast with a slot of its level or higher, never lower. Bug caught: a 1st-level spell cast from slot 0.
  it("fails if Shield is cast below its level, or is not cast at any higher slot", () => {
    expect(reactionBoonFor(shield(), 0)).toBeNull();
    expect(reactionBoonFor(shield(), 3)).toEqual({ grants: { ac: 5 } });
  });
});
