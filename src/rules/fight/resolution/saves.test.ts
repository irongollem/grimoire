/**
 * Resolving a save-based action: each target's save, the one damage roll and the conditions a failure gives, driven by
 * scripted dice against the real fight engine. Every expected number is worked out in the comment above it from the rule
 * it comes from, never read off a run. PHB 2014 means the 2014 Player's Handbook.
 */
import { describe, expect, it } from "vitest";
import { emptyDefenses, type StatBlockEntry } from "@/types/statBlock.types";
import { combatant, pc } from "../fightTestKit";
import type { Cover } from "../terrain/sight";
import { resolveSaveOn } from "./saves";
import { scripted, table, victim, wolf } from "./resolutionTestKit";

describe("resolveSaveOn", () => {
  const fireball: StatBlockEntry = {
    name: "Fire Burst",
    description: "",
    structured: {
      kind: "save", source: "manual",
      save: { ability: "dex", dc: 14, fail: [{ dice: "8d6", type: "fire" }], success: "half", conditions: [{ name: "Prone" }] },
    },
  };
  const crowd = () => [wolf(), combatant("a", { hp: 40, max_hp: 40 }), combatant("b", { hp: 40, max_hp: 40 }), combatant("c", { hp: 40, max_hp: 40 })];

  // PHB 2014 "Saving Throws" and the spell rule "a success takes half": one damage roll for everyone. 8d6 faces
  // 6+5+3+3+2+2+1+1 = 23. a rolls 5+0 = 5 < DC 14: fails and takes 23. b rolls 12+3 = 15: saves and takes half, 23/2 rounded
  // down (PHB 2014 ch. 1 "Rounding Down") = 11. c fails (3+0) but is immune to Prone. From 40: a 17, b 29, c 17.
  it("rolls the damage once for all, halves it once for the saver, and gives the failers the condition unless they are immune", async () => {
    const s = scripted([[5], [12], [3], [6, 5, 3, 3, 2, 2, 1, 1]]);
    const t = table(crowd(), {
      dice: s.dice,
      bonus: { a: 0, b: 3, c: 0 },
      defenses: { c: { ...emptyDefenses(), condition_immunities: ["Prone"] } },
    });
    const done = await resolveSaveOn(t.ctx, {
      attacker: t.get("wolf"), entry: fireball, targets: [t.get("a"), t.get("b"), t.get("c")],
    });
    expect(s.asks.filter((a) => a.isDamage)).toHaveLength(1);
    expect(s.asks.filter((a) => !a.isDamage).map((a) => a.rollerId)).toEqual(["a", "b", "c"]);
    expect([t.hp("a"), t.hp("b"), t.hp("c")]).toEqual([17, 29, 17]);
    expect(done.summary.targets.map((x) => [x.success, x.share, x.damageTotal])).toEqual([
      [false, "full", 23],
      [true, "half", 11],
      [false, "full", 23],
    ]);
    expect(t.get("a").conditions.map((c) => c.name)).toEqual(["Prone"]);
    expect(t.get("b").conditions).toEqual([]);
    expect(t.get("c").conditions).toEqual([]);
    expect(done.summary.targets[2].conditionsImmune).toEqual(["Prone"]);
  });

  // SRD "Damage Rolls" rounds the half down once over the whole roll: 7 fire + 7 poison is 14, half is 7 (not 3 + 3 = 6).
  it("halves a damage roll of several parts once over the whole roll", async () => {
    const twoParts: StatBlockEntry = {
      ...fireball,
      structured: {
        kind: "save", source: "manual",
        save: { ability: "dex", dc: 14, fail: [{ dice: "1d8", type: "fire" }, { dice: "1d8", type: "poison" }], success: "half", conditions: [] },
      },
    };
    const s = scripted([[18], [7], [7]]);
    const t = table(crowd(), { dice: s.dice, bonus: { a: 0 } });
    const done = await resolveSaveOn(t.ctx, { attacker: t.get("wolf"), entry: twoParts, targets: [t.get("a")] });
    expect(done.summary.targets[0]).toMatchObject({ success: true, damageTotal: 7 });
    expect(t.hp("a")).toBe(33);
  });

  // PHB 2014 appendix A "Paralyzed": automatically fails Strength and Dexterity saves, so no die is rolled for it.
  it("throws no die for a target that fails automatically, and no damage when every target saved against a save with no half", async () => {
    const web: StatBlockEntry = {
      ...fireball,
      structured: { kind: "save", source: "manual", save: { ability: "dex", dc: 12, fail: [{ dice: "2d6", type: "bludgeoning" }], success: "none", conditions: [] } },
    };
    // a is Paralyzed: it fails without a die, and 2d6 (3 + 4) is rolled for it: 40 - 7 = 33.
    const failing = scripted([[3, 4]]);
    const t = table([wolf(), combatant("a", { hp: 40, max_hp: 40, conditions: [{ name: "Paralyzed" }] })], { dice: failing.dice, bonus: { a: 0 } });
    const done = await resolveSaveOn(t.ctx, { attacker: t.get("wolf"), entry: web, targets: [t.get("a")] });
    expect(failing.asks.every((a) => a.isDamage)).toBe(true);
    expect(done.summary.targets[0]).toMatchObject({ autoFail: true, natural: null, success: false, damageTotal: 7 });
    expect(t.hp("a")).toBe(33);

    // b saves (15 + 0 >= 12) and a save with no half takes nothing, so no damage dice are thrown at all.
    const saving = scripted([[15]]);
    const t2 = table([wolf(), combatant("b", { hp: 40, max_hp: 40 })], { dice: saving.dice, bonus: { b: 0 } });
    const saved = await resolveSaveOn(t2.ctx, { attacker: t2.get("wolf"), entry: web, targets: [t2.get("b")] });
    expect(saved.amounts).toEqual([]);
    expect(saving.asks).toHaveLength(1);
    expect(t2.hp("b")).toBe(40);
  });

  it("refuses a target with no stat block to make the save from", async () => {
    const t = table([wolf(), pc("nessa")], { dice: scripted([]).dice });
    await expect(resolveSaveOn(t.ctx, { attacker: t.get("wolf"), entry: fireball, targets: [t.get("nessa")] })).rejects.toThrow(/player rolls it/);
  });
});

// PHB 2014 ch. 9 "Cover": half cover +2 to AC and Dexterity saves, three-quarters +5, total cannot be targeted directly.
describe("cover on the server's saves", () => {
  const burst = (ability: "dex" | "con"): StatBlockEntry => ({
    name: "Burst",
    description: "",
    structured: { kind: "save", source: "manual", save: { ability, dc: 14, fail: [{ dice: "2d6", type: "fire" }], success: "half", conditions: [] } },
  });
  const saveWith = async (cover: Cover | undefined, d20: number, ability: "dex" | "con" = "dex") => {
    // A failed or successful save both take damage here (half on a success), so the damage die is always scripted: 3 + 4 = 7.
    const s = scripted([[d20], [3, 4]]);
    const t = table([wolf(), combatant("a", { hp: 40, max_hp: 40 })], { dice: s.dice, bonus: { a: 0 }, cover: cover === undefined ? undefined : { a: cover } });
    const done = await resolveSaveOn(t.ctx, { attacker: t.get("wolf"), entry: burst(ability), targets: [t.get("a")] });
    return { target: done.summary.targets[0], s };
  };

  // DC 14, Dex +0. Half cover +2: d20 12 totals 14 and saves (boundary); d20 11 totals 13 and fails. Without the cover 12 fails.
  it("fails if half cover does not add 2 to a Dexterity save, on both sides of the DC", async () => {
    const saved = await saveWith("half", 12);
    expect(saved.target).toMatchObject({ total: 14, coverBonus: 2, success: true, share: "half" });
    expect(saved.s.asks[0].modifier).toBe(2);
    const failed = await saveWith("half", 11);
    expect(failed.target).toMatchObject({ total: 13, coverBonus: 2, success: false, share: "full" });
  });

  it("fails if three-quarters cover does not add 5 to a Dexterity save, on both sides of the DC", async () => {
    const saved = await saveWith("three_quarters", 9);
    expect(saved.target).toMatchObject({ total: 14, coverBonus: 5, success: true });
    const failed = await saveWith("three_quarters", 8);
    expect(failed.target).toMatchObject({ total: 13, coverBonus: 5, success: false });
  });

  // App convention: a save action is not refused at total cover (areas can round corners); the target gets the three-quarters
  // bonus. d20 9 + 5 = 14 saves; a refusal or a +0 would not leave this save.
  it("fails if a target at total cover is refused a save or given no bonus", async () => {
    const saved = await saveWith("total", 9);
    expect(saved.target).toMatchObject({ total: 14, coverBonus: 5, success: true });
  });

  // PHB 2014 ch. 9 gives cover to Dexterity saves only. A Constitution save of d20 12 + 0 = 12 fails DC 14 under half cover.
  it("fails if cover is added to a save that is not a Dexterity save", async () => {
    const failed = await saveWith("half", 12, "con");
    expect(failed.target).toMatchObject({ total: 12, coverBonus: 0, success: false });
  });

  // Nothing known (no hook, or no entry for the target) is no bonus: the same d20 12 fails DC 14.
  it("fails if a save with no known cover gets a bonus", async () => {
    const failed = await saveWith(undefined, 12);
    expect(failed.target).toMatchObject({ total: 12, coverBonus: 0, success: false });
  });
});

// SRD 5.1 Fear: "While frightened by this spell, a creature must take the Dash action and move away from you by the safest
// available route on each of its turns, unless there is nowhere to move."
describe("a condition that makes the bearer flee its source", () => {
  const frightening = (mustFlee: boolean): StatBlockEntry => ({
    name: "Fear", description: "",
    structured: { kind: "save", source: "manual", save: { ability: "wis", dc: 14, fail: [], success: "none", conditions: [{ name: "Frightened", ...(mustFlee ? { mustFlee: true } : {}) }] } },
  });

  // Bug caught: the flag stays on the stat block's save condition and never reaches the applied condition, so the tactics
  // (which read the bearer's own conditions) never see that it must flee, and it is written beside the source because what it
  // flees from is the source creature.
  it("is written on the applied condition's source, which names who it flees", async () => {
    const s = scripted([[2]]);
    const t = table([wolf(), victim()], { dice: s.dice, bonus: { victim: 0 } });
    await resolveSaveOn(t.ctx, { attacker: t.get("wolf"), entry: frightening(true), targets: [t.get("victim")] });
    expect(t.get("victim").conditions).toEqual([{ name: "Frightened", source: { id: "wolf", spell: "Fear", mustFlee: true } }]);
  });

  // Bug caught: every frightening effect starts making its bearer run.
  it("is not written when the condition does not say it", async () => {
    const s = scripted([[2]]);
    const t = table([wolf(), victim()], { dice: s.dice, bonus: { victim: 0 } });
    await resolveSaveOn(t.ctx, { attacker: t.get("wolf"), entry: frightening(false), targets: [t.get("victim")] });
    expect(t.get("victim").conditions[0].source).not.toHaveProperty("mustFlee");
  });
});

