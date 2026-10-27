import { describe, expect, it } from "vitest";
import type { ActionStructure, SaveEnds, SaveStructure } from "@/types/statBlock.types";
import { describeStructure, saveLabel } from "./describeStructure";

const base = { source: "parsed" } as const;

describe("describeStructure", () => {
  it("describes an attack with reach and a rider", () => {
    const s: ActionStructure = {
      ...base,
      kind: "attack",
      attack: {
        delivery: "melee",
        bonus: 4,
        reach: 5,
        hit: [
          { dice: "1d6+2", type: "slashing" },
          { dice: "2d6", type: "poison" },
        ],
      },
    };
    expect(describeStructure(s)).toEqual({
      summary: "+4 to hit · reach 5 ft · 1d6+2 slashing + 2d6 poison",
      badges: [],
    });
  });

  it("describes a ranged attack with a range band, a negative bonus and an untyped part", () => {
    const s: ActionStructure = {
      ...base,
      kind: "attack",
      attack: { delivery: "ranged", bonus: -1, range: { normal: 80, long: 320 }, hit: [{ dice: "1", type: null }] },
    };
    expect(describeStructure(s).summary).toBe("-1 to hit · range 80/320 ft · 1");
  });

  it("writes a zero bonus and a zero reach, and a range with no long band", () => {
    const at = (attack: Partial<NonNullable<ActionStructure["attack"]>>): ActionStructure => ({
      ...base,
      kind: "attack",
      attack: { delivery: "melee", bonus: 0, hit: [], ...attack },
    });
    expect(describeStructure(at({})).summary).toBe("+0 to hit");
    expect(describeStructure(at({ reach: 0 })).summary).toBe("+0 to hit · reach 0 ft");
    expect(describeStructure(at({ delivery: "ranged", range: { normal: 30 } })).summary).toBe("+0 to hit · range 30 ft");
  });

  it("describes a save with half damage and a condition", () => {
    const s: ActionStructure = {
      ...base,
      kind: "save",
      save: { ability: "dex", dc: 14, fail: [{ dice: "12d6", type: "poison" }], success: "half", conditions: [{ name: "Prone" }] },
    };
    expect(describeStructure(s).summary).toBe("DC 14 Dex save · 12d6 poison, half on success · Prone");
  });

  it("describes a save with no damage", () => {
    const s: ActionStructure = {
      ...base,
      kind: "save",
      save: { ability: "wis", dc: 12, fail: [], success: "none", conditions: [{ name: "Frightened" }] },
    };
    expect(describeStructure(s).summary).toBe("DC 12 Wis save · Frightened");
  });

  it("says what ends a save's conditions (#1050)", () => {
    const save: Omit<SaveStructure, "conditions"> = { ability: "con", dc: 10, fail: [], success: "none" };
    const said = (ends: SaveEnds) =>
      describeStructure({ ...base, kind: "save", save: { ...save, conditions: [{ name: "Paralyzed", ends }] } }).summary;
    expect(said({ kind: "save", at: "end" })).toBe("DC 10 Con save · Paralyzed (save ends)");
    expect(said({ kind: "save", at: "start" })).toBe("DC 10 Con save · Paralyzed (save ends at turn start)");
    expect(said({ kind: "turn", at: "end", of: "self" })).toBe("DC 10 Con save · Paralyzed (until the end of the target's next turn)");
    expect(said({ kind: "turn", at: "start", of: "source" })).toBe("DC 10 Con save · Paralyzed (until the start of this creature's next turn)");
    expect(said({ kind: "rounds", remaining: 10 })).toBe("DC 10 Con save · Paralyzed (10 rounds)");
    expect(said({ kind: "save", at: "end", remaining: 10 })).toBe("DC 10 Con save · Paralyzed (save ends, max 10 rounds)");
    expect(said({ kind: "save", at: "start", remaining: 1 })).toBe("DC 10 Con save · Paralyzed (save ends at turn start, max 1 round)");
  });

  it("gives each condition of a save its own end (#1055)", () => {
    const s: ActionStructure = {
      ...base,
      kind: "save",
      save: {
        ability: "str",
        dc: 12,
        fail: [],
        success: "none",
        conditions: [
          { name: "Frightened", ends: { kind: "rounds", remaining: 10 } },
          { name: "Restrained", ends: { kind: "save", at: "end", remaining: 10 } },
          { name: "Prone" },
        ],
      },
    };
    expect(describeStructure(s).summary).toBe("DC 12 Str save · Frightened (10 rounds), Restrained (save ends, max 10 rounds), Prone");
  });

  it("adds the save of an attack whose hit forces one", () => {
    const s: ActionStructure = {
      ...base,
      kind: "attack",
      attack: { delivery: "melee", bonus: 5, reach: 5, hit: [{ dice: "1d8", type: "piercing" }] },
      save: { ability: "con", dc: 13, fail: [], success: "none", conditions: [{ name: "Poisoned" }] },
    };
    expect(describeStructure(s).summary).toBe("+5 to hit · reach 5 ft · 1d8 piercing · DC 13 Con save · Poisoned");
  });

  it("describes a multiattack and nothing for an empty one", () => {
    const m: ActionStructure = {
      ...base,
      kind: "multiattack",
      multiattack: [
        { action: "Claw", count: 2 },
        { action: "Bite", count: 1 },
      ],
    };
    expect(describeStructure(m).summary).toBe("2× Claw, 1× Bite");
    expect(describeStructure({ ...base, kind: "multiattack", multiattack: [] }).summary).toBeNull();
  });

  it("gives every badge", () => {
    expect(describeStructure({ ...base, kind: "other", recharge: { min: 5, max: 6 } }).badges).toEqual(["Recharge 5–6"]);
    expect(describeStructure({ ...base, kind: "other", recharge: { min: 6, max: 6 } }).badges).toEqual(["Recharge 6"]);
    expect(describeStructure({ ...base, kind: "other", uses: { count: 3, per: "day" } }).badges).toEqual(["3/day"]);
    expect(describeStructure({ ...base, kind: "other", uses: { count: 1, per: "long_rest" } }).badges).toEqual([
      "1/long rest",
    ]);
    expect(describeStructure({ ...base, kind: "other", legendary_cost: 2 }).badges).toEqual(["Costs 2"]);
  });

  it("has no summary for an unrolled entry", () => {
    expect(describeStructure({ ...base, kind: "other" })).toEqual({ summary: null, badges: [] });
  });
});

describe("describeStructure options", () => {
  const options: ActionStructure = {
    source: "parsed",
    kind: "options",
    recharge: { min: 5, max: 6 },
    options: [
      {
        name: "Fire Breath",
        kind: "save",
        save: { ability: "dex", dc: 15, fail: [{ dice: "12d6", type: "fire" }], success: "half", conditions: [] },
      },
      {
        name: "Sleep Breath",
        kind: "save",
        save: { ability: "con", dc: 15, fail: [], success: "none", conditions: [{ name: "Unconscious" }] },
      },
    ],
  };

  it("lists each option and joins them into one summary", () => {
    const d = describeStructure(options);
    expect(d.options).toEqual([
      { name: "Fire Breath", summary: "DC 15 Dex save · 12d6 fire, half on success" },
      { name: "Sleep Breath", summary: "DC 15 Con save · Unconscious" },
    ]);
    expect(d.summary).toBe(
      "One of: Fire Breath (DC 15 Dex save · 12d6 fire, half on success) · Sleep Breath (DC 15 Con save · Unconscious)",
    );
    expect(d.badges).toEqual(["Recharge 5–6"]);
  });

  it("rolls nothing for an options entry with no options", () => {
    expect(describeStructure({ source: "parsed", kind: "options", options: [] })).toEqual({ summary: null, badges: [] });
  });

  it("reads an option by its kind: an attack option shows its attack, a save option its save", () => {
    const attack = { delivery: "melee" as const, bonus: 3, hit: [] };
    const save = { ability: "dex" as const, dc: 11, fail: [], success: "none" as const, conditions: [] };
    const d = describeStructure({
      source: "parsed",
      kind: "options",
      options: [
        { name: "Strike", kind: "attack", attack, save },
        { name: "Burst", kind: "save", attack, save },
      ],
    });
    expect(d.options?.map((o) => o.summary)).toEqual(["+3 to hit · DC 11 Dex save", "DC 11 Dex save"]);
  });

  it("describes an attack option and exposes saveLabel", () => {
    const d = describeStructure({
      source: "parsed",
      kind: "options",
      options: [
        { name: "Bite", kind: "attack", attack: { delivery: "melee", bonus: 6, reach: 5, hit: [{ dice: "2d6", type: "piercing" }] } },
        { name: "Spit", kind: "save", save: { ability: "dex", dc: 12, fail: [], success: "none", conditions: [] } },
      ],
    });
    expect(d.options?.[0].summary).toBe("+6 to hit · reach 5 ft · 2d6 piercing");
    expect(saveLabel({ ability: "wis", dc: 11 })).toBe("DC 11 Wis");
  });
});
