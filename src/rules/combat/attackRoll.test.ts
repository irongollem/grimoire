import { describe, expect, it } from "vitest";
import { attackRollMode, autoCritOnHit, resolveAttack } from "./attackRoll.ts";

const base = { attackerConditions: [], targetConditions: [], delivery: "melee" as const, withinFiveFeet: true, ruleset: "2014" as const };

describe("attackRollMode", () => {
  it.each([
    ["attacker Poisoned", { attackerConditions: [{ name: "Poisoned" }] }, "disadvantage"],
    ["attacker Prone", { attackerConditions: [{ name: "Prone" }] }, "disadvantage"],
    ["attacker Invisible", { attackerConditions: [{ name: "Invisible" }] }, "advantage"],
    ["target Stunned", { targetConditions: [{ name: "Stunned" }] }, "advantage"],
    ["target Restrained", { targetConditions: [{ name: "Restrained" }] }, "advantage"],
    ["target Invisible", { targetConditions: [{ name: "Invisible" }] }, "disadvantage"],
    ["target Prone within 5ft", { targetConditions: [{ name: "Prone" }] }, "advantage"],
    ["target Prone far", { targetConditions: [{ name: "Prone" }], withinFiveFeet: false }, "disadvantage"],
    ["ranged with enemy adjacent", { delivery: "ranged" as const }, "disadvantage"],
    ["ranged far, nothing else", { delivery: "ranged" as const, withinFiveFeet: false }, "normal"],
    ["2014 exhaustion 3", { attackerConditions: [{ name: "Exhaustion", level: 3 }] }, "disadvantage"],
    ["2014 exhaustion 2", { attackerConditions: [{ name: "Exhaustion", level: 2 }] }, "normal"],
    ["2024 exhaustion 3 gives no disadvantage", { attackerConditions: [{ name: "Exhaustion", level: 3 }], ruleset: "2024" as const }, "normal"],
    ["DM advantage", { dmMode: "advantage" as const }, "advantage"],
  ])("%s", (_n, over, mode) => {
    const r = attackRollMode({ ...base, ...over });
    expect(r.mode).toBe(mode);
    if (mode !== "normal") expect(r.reasons.length).toBeGreaterThan(0);
  });

  it("advantage and disadvantage cancel regardless of count", () => {
    const r = attackRollMode({ ...base, attackerConditions: [{ name: "Poisoned" }, { name: "Prone" }], targetConditions: [{ name: "Stunned" }, { name: "Blinded" }] });
    expect(r.mode).toBe("normal");
  });
  it("a late source never flips an already cancelled roll", () => {
    // Poisoned attacker (dis) vs Stunned (adv) + Prone within 5 ft (adv): straight, not advantage.
    const r = attackRollMode({ ...base, attackerConditions: [{ name: "Poisoned" }], targetConditions: [{ name: "Stunned" }, { name: "Prone" }] });
    expect(r.mode).toBe("normal");
    expect(r.reasons).toHaveLength(3);
  });
  it("ranged, Poisoned, Restrained target, enemy adjacent: one advantage, two disadvantages -> straight", () => {
    const r = attackRollMode({
      ...base,
      delivery: "ranged",
      attackerConditions: [{ name: "Poisoned" }],
      targetConditions: [{ name: "Restrained" }],
    });
    expect(r.mode).toBe("normal");
  });
  it("DM override cancels a condition", () => {
    expect(attackRollMode({ ...base, attackerConditions: [{ name: "Poisoned" }], dmMode: "advantage" }).mode).toBe("normal");
  });
  it("names the prone cause", () => {
    expect(attackRollMode({ ...base, targetConditions: [{ name: "Prone" }] }).reasons).toContain("target Prone within 5 ft");
  });
});

describe("autoCritOnHit", () => {
  it.each([
    [[{ name: "Paralyzed" }], true, true],
    [[{ name: "Unconscious" }], true, true],
    [[{ name: "Paralyzed" }], false, false],
    [[{ name: "Stunned" }], true, false],
    [[], true, false],
  ])("%j within5=%s", (c, w, e) => expect(autoCritOnHit(c, w)).toBe(e));
});

describe("resolveAttack", () => {
  it("hits on meeting AC", () => expect(resolveAttack({ d20: 10, bonus: 5, targetAc: 15 }).hit).toBe(true));
  it("misses below AC", () => expect(resolveAttack({ d20: 9, bonus: 5, targetAc: 15 }).hit).toBe(false));
  it("nat 1 misses despite huge bonus", () => {
    const r = resolveAttack({ d20: 1, bonus: 50, targetAc: 10 });
    expect(r).toMatchObject({ hit: false, fumble: true, critical: false, total: 51 });
  });
  it("nat 20 hits AC 30 and crits", () => {
    expect(resolveAttack({ d20: 20, bonus: 0, targetAc: 30 })).toMatchObject({ hit: true, critical: true });
  });
  it("widened crit range", () => {
    expect(resolveAttack({ d20: 19, bonus: 0, targetAc: 30, critOn: 19 })).toMatchObject({ hit: true, critical: true });
  });
  it("autoCrit only on a hit", () => {
    expect(resolveAttack({ d20: 15, bonus: 0, targetAc: 10, autoCrit: true }).critical).toBe(true);
    expect(resolveAttack({ d20: 5, bonus: 0, targetAc: 10, autoCrit: true }).critical).toBe(false);
  });
  it("applies the exhaustion penalty", () => {
    expect(resolveAttack({ d20: 12, bonus: 4, targetAc: 16, penalty: -2 }).hit).toBe(false);
  });
});
