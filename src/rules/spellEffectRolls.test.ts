import { describe, expect, it } from "vitest";
import type { StructuredSpellEffect } from "@/types/spell.types";
import { groupSpellRolls } from "./spellEffectRolls";

const base: StructuredSpellEffect = {
  id: "base", phase: "impact", outcome: "failed_save", target: { type: null, count: null },
  kind: "damage", dice: "8d6", multiplier: 1, damageType: "fire", condition: null,
  description: null, scaling: null, modifier: null,
};
const half: StructuredSpellEffect = { ...base, id: "base-save-half", outcome: "successful_save", multiplier: 0.5 };

describe("groupSpellRolls", () => {
  it("shares one roll between a failed save and a half-damage save (PHB 2014 'Damage Rolls')", () => {
    const groups = groupSpellRolls([
      { targetId: "1", effect: base }, { targetId: "2", effect: half }, { targetId: "3", effect: base },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries.map((e) => e.targetId)).toEqual(["1", "2", "3"]);
  });

  it("gives a critical hit's doubled dice their own roll", () => {
    const groups = groupSpellRolls([
      { targetId: "1", effect: { ...base, dice: "16d6" } }, { targetId: "2", effect: base },
    ]);
    expect(groups).toHaveLength(2);
  });

  it("ignores spacing and case when comparing dice", () => {
    expect(groupSpellRolls([
      { targetId: "1", effect: base }, { targetId: "2", effect: { ...base, dice: "8D6 " } },
    ])).toHaveLength(1);
  });

  it("does not merge different phases, kinds or modifiers", () => {
    const groups = groupSpellRolls([
      { targetId: "1", effect: base },
      { targetId: "1", effect: { ...base, phase: "turn_start" } },
      { targetId: "1", effect: { ...base, kind: "healing" } },
      { targetId: "1", effect: { ...base, modifier: "spellcasting_ability" } },
    ]);
    expect(groups).toHaveLength(4);
  });

  it("skips entries without dice", () => {
    expect(groupSpellRolls([{ targetId: "1", effect: { ...base, dice: null, kind: "text" } }])).toEqual([]);
  });
});

describe("groupSpellRolls damage types and instances", () => {
  it("rolls equal dice of different damage types separately (Meteor Swarm: 20d6 fire and 20d6 bludgeoning), still sharing base with its half twin", () => {
    // PHB 2014 Meteor Swarm: "20d6 fire damage and 20d6 bludgeoning damage".
    const fire = { ...base, dice: "20d6" };
    const bludgeoning = { ...fire, id: "b", damageType: "bludgeoning" };
    const groups = groupSpellRolls([
      { targetId: "1", effect: fire }, { targetId: "1", effect: bludgeoning },
      { targetId: "2", effect: { ...fire, outcome: "successful_save", multiplier: 0.5 } },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.entries[0].effect.damageType === "fire")?.entries).toHaveLength(2);
  });

  const ray: StructuredSpellEffect = {
    ...base, outcome: "hit", dice: "2d6", instances: { noun: "ray", count: 3 },
  };
  it("gives each attack ray its own roll, and a crit only doubles its own ray (PHB 2014 Scorching Ray)", () => {
    const groups = groupSpellRolls([
      { targetId: "1", effect: ray }, { targetId: "2", effect: { ...ray, dice: "4d6" } }, { targetId: "3", effect: ray },
    ]);
    expect(groups.map((g) => g.dice)).toEqual(["2d6", "4d6", "2d6"]);
  });

  it("lets automatic darts share one roll (PHB 2014 Magic Missile: they strike simultaneously)", () => {
    const dart = { ...ray, outcome: "automatic" as const, dice: "1d4" };
    const groups = groupSpellRolls([1, 2, 3].map((n) => ({ targetId: String(n), effect: dart })));
    expect(groups).toHaveLength(1);
    expect(groups[0].entries).toHaveLength(3);
  });
});
