import { describe, expect, it } from "vitest";
import { formHpPools } from "@/rules/hitPoints";
import {
  damageOutcome,
  deathSaveRollOutcome,
  describeDamageOutcome,
  dyingStatus,
  healingOutcome,
  reviveOutcome,
} from "@/rules/dying";

const fresh = { successes: 0, failures: 0 };
function pc(hp: number, max = 10, temp = 0, saves = fresh, conditions: string[] = []) {
  return { pools: formHpPools({ current_hp: hp, max_hp: max, temp_hp: temp }, null), saves, conditions };
}

describe("dyingStatus", () => {
  it("reads alive, dying, stable and dead from HP and saves", () => {
    expect(dyingStatus(5, { successes: 0, failures: 3 })).toBe("alive");
    expect(dyingStatus(0, fresh)).toBe("dying");
    expect(dyingStatus(0, { successes: 3, failures: 0 })).toBe("stable");
    expect(dyingStatus(0, { successes: 0, failures: 3 })).toBe("dead");
  });
});

describe("damageOutcome", () => {
  it("drops to 0 HP unconscious with clear saves", () => {
    const r = damageOutcome(pc(10), { amount: 12 });
    expect(r.current_hp).toBe(0);
    expect(r.outcome).toBe("dropped");
    expect(r.conditions).toContain("Unconscious");
    expect(r.saves).toEqual(fresh);
  });

  it("kills outright when the remainder equals the HP maximum", () => {
    const r = damageOutcome(pc(10), { amount: 20 });
    expect(r.outcome).toBe("died");
    expect(r.saves.failures).toBe(3);
    expect(r.current_hp).toBe(0);
  });

  it("does not kill one short of the threshold", () => {
    expect(damageOutcome(pc(10), { amount: 19 }).outcome).toBe("dropped");
  });

  it("the 28 HP character who takes 70 dies", () => {
    expect(damageOutcome(pc(28, 28), { amount: 70 }).outcome).toBe("died");
  });

  it("temp HP absorbs first, and soaked damage never kills", () => {
    const r = damageOutcome(pc(10, 10, 15), { amount: 25 });
    // 15 soaked, 10 reaches HP: 10 to 0, 0 left over.
    expect(r.outcome).toBe("dropped");
    expect(r.temp_hp).toBe(0);
  });

  it("a hit that only dents HP does nothing special", () => {
    const r = damageOutcome(pc(10), { amount: 3 });
    expect(r.outcome).toBeNull();
    expect(r.current_hp).toBe(7);
    expect(r.conditions).toEqual([]);
  });

  it("damage at 0 HP is one failure, two on a critical", () => {
    expect(damageOutcome(pc(0, 10, 0, fresh, ["Unconscious"]), { amount: 3 }).saves.failures).toBe(1);
    const crit = damageOutcome(pc(0, 10, 0, { successes: 1, failures: 0 }), { amount: 3, critical: true });
    expect(crit.saves).toEqual({ successes: 1, failures: 2 });
    expect(crit.outcome).toBe("dying-worse");
  });

  it("the third failure from damage kills", () => {
    const r = damageOutcome(pc(0, 10, 0, { successes: 0, failures: 2 }), { amount: 1 });
    expect(r.outcome).toBe("died");
    expect(r.saves.failures).toBe(3);
  });

  it("damage at 0 HP at or over the HP maximum kills outright", () => {
    expect(damageOutcome(pc(0), { amount: 10 }).outcome).toBe("died");
    expect(damageOutcome(pc(0), { amount: 9 }).outcome).toBe("dying-worse");
  });

  it("temp HP shields a creature at 0 HP", () => {
    const r = damageOutcome(pc(0, 10, 5), { amount: 4 });
    expect(r.outcome).toBeNull();
    expect(r.saves).toEqual(fresh);
    expect(r.temp_hp).toBe(1);
  });

  it("a stable creature that is hurt is dying again", () => {
    const r = damageOutcome(pc(0, 10, 0, { successes: 3, failures: 0 }), { amount: 2 });
    expect(r.outcome).toBe("stabilised-broken");
    expect(r.saves).toEqual({ successes: 0, failures: 1 });
  });

  it("leaves the dead alone", () => {
    const r = damageOutcome(pc(0, 10, 0, { successes: 0, failures: 3 }), { amount: 5 });
    expect(r.outcome).toBeNull();
    expect(r.saves.failures).toBe(3);
  });

  it("2014 Wild Shape: damage that stays in the beast cannot kill", () => {
    const pools = formHpPools({ current_hp: 10, max_hp: 10, temp_hp: 0 }, { beast_hp: 40, beast_max_hp: 40 });
    const r = damageOutcome({ pools, saves: fresh, conditions: [] }, { amount: 39 });
    expect(r.outcome).toBeNull();
    expect(r.beast_hp).toBe(1);
  });

  it("2014 Wild Shape: only carry-over into the normal form counts", () => {
    const pools = formHpPools({ current_hp: 10, max_hp: 10, temp_hp: 0 }, { beast_hp: 8, beast_max_hp: 8 });
    // 8 beast, 10 carry: own HP to 0 with 0 left over: drops, not dies.
    const drop = damageOutcome({ pools, saves: fresh, conditions: [] }, { amount: 18 });
    expect(drop.outcome).toBe("dropped");
    expect(drop.reverted).toBe(true);
    // 8 + 10 + 10 = 28: remainder 10 >= max 10 dies.
    expect(damageOutcome({ pools, saves: fresh, conditions: [] }, { amount: 28 }).outcome).toBe("died");
    // Carry that leaves the character standing is just a reverted form.
    const standing = damageOutcome({ pools, saves: fresh, conditions: [] }, { amount: 12 });
    expect(standing.outcome).toBeNull();
    expect(standing.current_hp).toBe(6);
  });

  it("2024 own-HP form: reaching 0 ends the form and drops them", () => {
    const pools = formHpPools({ current_hp: 10, max_hp: 10, temp_hp: 0 }, { beast_hp: null, beast_max_hp: null });
    const r = damageOutcome({ pools, saves: fresh, conditions: [] }, { amount: 10 });
    expect(r.reverted).toBe(true);
    expect(r.outcome).toBe("dropped");
  });
});

describe("healingOutcome", () => {
  it("healing from 0 clears saves and Unconscious", () => {
    const r = healingOutcome(pc(0, 10, 0, { successes: 2, failures: 2 }, ["Unconscious", "Poisoned"]), 2);
    expect(r.current_hp).toBe(2);
    expect(r.saves).toEqual(fresh);
    expect(r.conditions).toEqual(["Poisoned"]);
    expect(r.outcome).toBe("revived-by-healing");
  });

  it("healing a stable creature wakes it", () => {
    expect(healingOutcome(pc(0, 10, 0, { successes: 3, failures: 0 }, ["Unconscious"]), 1).outcome).toBe("revived-by-healing");
  });

  it("healing the dead does nothing", () => {
    const r = healingOutcome(pc(0, 10, 0, { successes: 0, failures: 3 }, ["Unconscious"]), 5);
    expect(r.current_hp).toBe(0);
    expect(r.outcome).toBe("healing-refused-dead");
  });

  it("healing above 0 changes nothing else", () => {
    const r = healingOutcome(pc(4), 3);
    expect(r.current_hp).toBe(7);
    expect(r.outcome).toBeNull();
  });
});

describe("reviveOutcome and death save rolls", () => {
  it("revive returns 1 HP, clears saves, removes Unconscious", () => {
    expect(reviveOutcome(["Unconscious", "Prone"])).toEqual({ current_hp: 1, saves: fresh, conditions: ["Prone"] });
  });

  it("rolls follow the book", () => {
    expect(deathSaveRollOutcome(fresh, ["Unconscious"], 20)).toMatchObject({ current_hp: 1, conditions: [] });
    expect(deathSaveRollOutcome(fresh, [], 1).saves.failures).toBe(2);
    expect(deathSaveRollOutcome(fresh, [], 10).saves.successes).toBe(1);
    expect(deathSaveRollOutcome(fresh, [], 9).saves.failures).toBe(1);
    expect(deathSaveRollOutcome({ successes: 0, failures: 2 }, [], 1).saves.failures).toBe(3);
  });
});

describe("describeDamageOutcome", () => {
  it("speaks plainly and stays quiet when nothing happened", () => {
    expect(describeDamageOutcome("Rosie", 70, "died")).toBe("Rosie took 70 damage and died.");
    expect(describeDamageOutcome("Rosie", 3, null)).toBeNull();
  });
});
