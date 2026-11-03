import { describe, it, expect } from "vitest";
import { combatantFootprint, combatantSize, sizeToFootprint } from "@/lib/battlemap/tokenFootprint";

describe("sizeToFootprint", () => {
  // PHB 2024 "Creature Size": Tiny 2½ ft, Small/Medium 5 ft, Large 10 ft, Huge 15 ft, Gargantuan 20 ft.
  it.each([
    ["Tiny", 0.5],
    ["Small", 1],
    ["Medium", 1],
    ["Large", 2],
    ["Huge", 3],
    ["Gargantuan", 4],
  ])("%s takes %f cells across", (size, cells) => {
    expect(sizeToFootprint(size)).toBe(cells);
  });

  it("is case-insensitive and tolerates trimmed input", () => {
    expect(sizeToFootprint(" huge ")).toBe(3);
    expect(sizeToFootprint("GARGANTUAN")).toBe(4);
  });

  it("defaults to Medium for null / unknown / empty (app convention)", () => {
    expect(sizeToFootprint(null)).toBe(1);
    expect(sizeToFootprint(undefined)).toBe(1);
    expect(sizeToFootprint("")).toBe(1);
    expect(sizeToFootprint("Colossal")).toBe(1);
  });

  it("does not read a prototype member as a size", () => {
    expect(sizeToFootprint("constructor")).toBe(1);
  });
});

describe("combatantFootprint", () => {
  it("a wild-shaped druid takes the beast's size, not their own", () => {
    // PHB 2024 "Wild Shape": the druid assumes the beast's game statistics, size included.
    const druid = { size: "medium", footprint: 1, wildshape: { beast_size: "large" } } as const;
    expect(combatantFootprint(druid)).toBe(2);
    expect(combatantSize(druid)).toBe("large");
  });

  it("an Enlarge/Reduce override wins over a beast form", () => {
    // PHB 2024 "Enlarge/Reduce": the target's size changes by one category for the duration.
    const shaped = { size: "medium", footprint: 1, wildshape: { beast_size: "large" }, size_override: "huge" } as const;
    expect(combatantFootprint(shaped)).toBe(3);
    expect(combatantSize(shaped)).toBe("huge");
  });

  it("reduces a Tiny override to half a square", () => {
    expect(combatantFootprint({ footprint: 3, size: "huge", size_override: "tiny" })).toBe(0.5);
  });

  it("reads the baked size when nothing overrides it", () => {
    expect(combatantFootprint({ size: "huge" })).toBe(3);
  });

  it("falls back to the footprint baked before sizes were stored", () => {
    expect(combatantFootprint({ footprint: 2 })).toBe(2);
  });

  it("is Medium for a combatant that never carried a size", () => {
    expect(combatantFootprint({})).toBe(1);
  });
});
