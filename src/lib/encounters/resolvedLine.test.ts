import { describe, expect, it } from "vitest";
import type { ResolvedAction } from "@/rules/fight/fightState";
import { describeResolvedAction } from "./resolvedLine";

const nameOf = (id: string) => ({ ogre: "Ogre", fresco: "Fresco" })[id] ?? id;
const attack = (over: Partial<Extract<ResolvedAction, { kind: "attack" }>>): ResolvedAction => ({
  kind: "attack", attackerId: "ogre", targetId: "fresco", action: "Greatclub", natural: 14, total: 19, targetAc: 15, cover: null, coverAc: 0,
  mode: "normal", hit: true, critical: false, fumble: false, damage: [], damageTotal: 9, dying: null, save: null, ...over,
});

describe("describeResolvedAction", () => {
  it("fails if a miss is told as a hit or still quotes damage", () => {
    const line = describeResolvedAction(attack({ hit: false, total: 8, damageTotal: 0 }), nameOf);
    expect(line).toBe("Ogre attacks Fresco with Greatclub: miss, 8 against AC 15.");
  });

  it("fails if a hit does not say the damage taken or that the target dropped", () => {
    const line = describeResolvedAction(attack({ dying: "dropped" }), nameOf);
    expect(line).toBe("Ogre attacks Fresco with Greatclub: hit, 19 against AC 15, 9 damage and drops to 0 hit points.");
  });

  it("fails if a save made and a save failed read the same", () => {
    const base = { targetId: "fresco", natural: 9, total: 12, autoFail: false, coverBonus: 0 as const, share: "half" as const, damage: [], dying: null, conditionsApplied: [], conditionsImmune: [] };
    const made = describeResolvedAction({ kind: "save", attackerId: "ogre", action: "Fire Breath", ability: "dex", dc: 13, targets: [{ ...base, success: true, damageTotal: 5 }] }, nameOf);
    const failed = describeResolvedAction({ kind: "save", attackerId: "ogre", action: "Fire Breath", ability: "dex", dc: 13, targets: [{ ...base, success: false, damageTotal: 10 }] }, nameOf);
    expect(made).toContain("Fresco makes the save (12), takes 5 damage.");
    expect(failed).toContain("Fresco fails the save (12), takes 10 damage.");
  });
});

describe("describeResolvedAction: break free", () => {
  const tried = (success: boolean) => ({ kind: "break_free" as const, instanceId: "fresco", name: "Restrained", ability: "str" as const, natural: 11, total: 14, dc: 14, success });
  // Bug caught: a freed creature and a held one read the same, so the DM cannot tell from the line whether the hold is gone.
  it("says who tried, with what, against which DC, and whether it worked", () => {
    expect(describeResolvedAction(tried(true), nameOf)).toBe("Fresco tries to break free of Restrained with a STR check: 14 (a 11 on the die) against DC 14, and is free.");
    expect(describeResolvedAction(tried(false), nameOf)).toContain("and stays held.");
  });

  // Bug caught: a boon's line naming only the first target, or joining three names with bare commas.
  it("fails if a boon's line leaves out a target or joins the names badly", () => {
    const boon = (targetIds: string[]): ResolvedAction => ({ kind: "boon", casterId: "ogre", spell: "Bless", castLevel: 1, targetIds });
    expect(describeResolvedAction(boon(["fresco"]), nameOf)).toBe("Ogre casts Bless on Fresco.");
    expect(describeResolvedAction(boon(["fresco", "ogre"]), nameOf)).toBe("Ogre casts Bless on Fresco and Ogre.");
    expect(describeResolvedAction(boon(["fresco", "ogre", "fresco"]), nameOf)).toBe("Ogre casts Bless on Fresco, Ogre and Fresco.");
  });

  // Heal ends conditions and leaves "diseases" to the table; Mass Heal shares a pool. Bug caught: a line that says only hit points, so the table never learns a
  // condition came off or that the diseases are theirs to rule.
  it("fails if a heal's line leaves out the conditions it ended, the diseases left to the table, or that the amount is a pool", () => {
    const heal = (over: Partial<Extract<ResolvedAction, { kind: "heal" }>>): ResolvedAction => ({
      kind: "heal", casterId: "ogre", spell: "Heal", castLevel: 6, rolled: 70, targets: [{ targetId: "fresco", regained: 70, revived: false, unaffected: false, ended: ["Blinded", "Deafened"] }], ...over,
    });
    expect(describeResolvedAction(heal({ leftToTable: ["diseases"] }), nameOf)).toBe("Ogre casts Heal (70 rolled): Fresco regains 70 hit points, and is no longer Blinded or Deafened. The table rules on diseases.");
    expect(describeResolvedAction(heal({ spell: "Mass Heal", rolled: 700, pool: true, targets: [{ targetId: "fresco", regained: 20, revived: false, unaffected: false }] }), nameOf)).toBe("Ogre casts Mass Heal (700 hit points to share): Fresco regains 20 hit points.");
    // Power Word Heal rolls nothing: the line must not say "0 rolled".
    expect(describeResolvedAction(heal({ spell: "Power Word Heal", castLevel: 9, rolled: 0, full: true, targets: [{ targetId: "fresco", regained: 33, revived: false, unaffected: false }] }), nameOf)).toBe("Ogre casts Power Word Heal (all hit points): Fresco regains 33 hit points.");
  });
});
