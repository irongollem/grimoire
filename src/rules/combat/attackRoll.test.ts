import { describe, expect, it } from "vitest";
import { attackRollMode, autoCritOnHit, resolveAttack } from "./attackRoll.ts";

const base = { attackerConditions: [], targetConditions: [], delivery: "melee" as const, withinFiveFeet: true, ruleset: "2014" as const };

describe("attackRollMode", () => {
  // SRD 5.2 "Conditions" (Poisoned, Invisible, Stunned, Prone), "Ranged Attacks in Close Combat"; PHB 2014 Exhaustion level 3 = disadvantage on attack rolls, 2024 uses a flat penalty instead
  it.each([
    ["attacker Poisoned", { attackerConditions: [{ name: "Poisoned" }] }, "disadvantage"],
    ["attacker Invisible", { attackerConditions: [{ name: "Invisible" }] }, "advantage"],
    ["target Stunned", { targetConditions: [{ name: "Stunned" }] }, "advantage"],
    ["target Invisible", { targetConditions: [{ name: "Invisible" }] }, "disadvantage"],
    ["target Prone within 5ft", { targetConditions: [{ name: "Prone" }] }, "advantage"],
    ["target Prone far", { targetConditions: [{ name: "Prone" }], withinFiveFeet: false }, "disadvantage"],
    ["ranged with a hostile next to the attacker", { delivery: "ranged" as const, hostileWithinFiveFeetOfAttacker: true }, "disadvantage"],
    ["ranged at long range", { delivery: "ranged" as const, withinFiveFeet: false, longRange: true }, "disadvantage"],
    ["ranged far, nothing else", { delivery: "ranged" as const, withinFiveFeet: false }, "normal"],
    ["2014 exhaustion 3", { attackerConditions: [{ name: "Exhaustion", level: 3 }] }, "disadvantage"],
    ["2024 exhaustion 3 gives no disadvantage", { attackerConditions: [{ name: "Exhaustion", level: 3 }], ruleset: "2024" as const }, "normal"],
    ["DM advantage", { dmMode: "advantage" as const }, "advantage"],
  ])("%s", (_n, over, mode) => {
    const r = attackRollMode({ ...base, ...over });
    expect(r.mode).toBe(mode);
    if (mode !== "normal") expect(r.reasons.length).toBeGreaterThan(0);
  });

  // PHB 2014 "Advantage and Disadvantage": any number of each cancels to a straight roll
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
      hostileWithinFiveFeetOfAttacker: true,
      attackerConditions: [{ name: "Poisoned" }],
      targetConditions: [{ name: "Restrained" }],
    });
    expect(r.mode).toBe("normal");
  });
  // Bug: one input ("within 5 ft") meant both "attacker next to the target" and "hostile next to the attacker", so a
  // ranged shot at an adjacent target was priced right only by accident and a hostile beside the attacker was invisible.
  it("the target being 5 ft away is not itself read as close combat: the caller states the hostile beside the attacker", () => {
    const r = attackRollMode({ ...base, delivery: "ranged", withinFiveFeet: true });
    expect(r.mode).toBe("normal");
  });
  it("a melee attack ignores both ranged facts", () => {
    const r = attackRollMode({ ...base, delivery: "melee", hostileWithinFiveFeetOfAttacker: true, longRange: true });
    expect(r.mode).toBe("normal");
  });
  it("a hostile next to the attacker, not the target, gives a ranged attack on a far target disadvantage (PHB 2014 ch. 9 \"Ranged Attacks in Close Combat\")", () => {
    const r = attackRollMode({ ...base, delivery: "ranged", withinFiveFeet: false, hostileWithinFiveFeetOfAttacker: true });
    expect(r.mode).toBe("disadvantage");
    expect(r.reasons).toEqual(["ranged attack with an enemy within 5 ft of the attacker"]);
  });
  it("close combat and long range together are still one disadvantage, not two that cancel anything", () => {
    const r = attackRollMode({ ...base, delivery: "ranged", withinFiveFeet: false, hostileWithinFiveFeetOfAttacker: true, longRange: true });
    expect(r.mode).toBe("disadvantage");
  });
  it("DM override cancels a condition", () => {
    expect(attackRollMode({ ...base, attackerConditions: [{ name: "Poisoned" }], dmMode: "advantage" }).mode).toBe("normal");
  });
  it("names the prone cause", () => {
    expect(attackRollMode({ ...base, targetConditions: [{ name: "Prone" }] }).reasons).toContain("target Prone within 5 ft");
  });
});

describe("Dodge against an attack (PHB 2014 ch. 9 \"Dodge\")", () => {
  const dodging = { name: "Dodging" };
  // Bug: only Incapacitated ended the benefit; a Grappled or Restrained dodger (Speed 0) kept it.
  it.each(["Grappled", "Restrained"])("is lost when the dodger is %s, which sets its Speed to 0", (name) => {
    const r = attackRollMode({ ...base, targetConditions: [dodging, { name }] });
    // Hand-worked: Restrained gives attackers advantage and Dodge is lost, so advantage; Grappled leaves a straight roll.
    expect(r.reasons).not.toContain("target is Dodging");
    expect(r.mode).toBe(name === "Restrained" ? "advantage" : "normal");
  });
  // PHB 2014 appendix A "Exhaustion" level 5: speed reduced to 0, so Dodge is lost and the attack is a straight roll.
  it("fails if a 2014 dodger at Exhaustion level 5 keeps disadvantage on attacks against it, or a 2024 one loses it", () => {
    const tired = { name: "Exhaustion", level: 5 };
    expect(attackRollMode({ ...base, targetConditions: [dodging, tired] }).mode).toBe("normal");
    expect(attackRollMode({ ...base, ruleset: "2024", targetConditions: [dodging, tired] }).mode).toBe("disadvantage");
  });
  it("still applies to a dodger that can move", () => {
    expect(attackRollMode({ ...base, targetConditions: [dodging] }).mode).toBe("disadvantage");
  });
});

describe("autoCritOnHit", () => {
  // SRD 5.2 "Paralyzed" / "Unconscious": a hit from within 5 feet is a critical hit
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
  // SRD 5.2 "D20 Tests": natural 20 always hits, natural 1 always misses
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
