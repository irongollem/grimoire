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
