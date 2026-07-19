import { describe, expect, it } from "vitest";
import { getMetamagicMap } from "./metamagic";

describe("ruleset-aware Metamagic", () => {
  it("uses the original Heightened and Seeking Spell costs in 2014", () => {
    const options = getMetamagicMap("2014");

    expect(options.get("Heightened Spell")?.sp_cost).toBe("3");
    expect(options.get("Seeking Spell")?.sp_cost).toBe("2");
  });

  it("uses the revised Heightened, Seeking, and Twinned Spell costs in 2024", () => {
    const options = getMetamagicMap("2024");

    expect(options.get("Heightened Spell")?.sp_cost).toBe("2");
    expect(options.get("Seeking Spell")?.sp_cost).toBe("1");
    expect(options.get("Twinned Spell")?.sp_cost).toBe("1");
  });

  it("shows the revised defensive and component benefits only in 2024", () => {
    const original = getMetamagicMap("2014");
    const revised = getMetamagicMap("2024");

    expect(original.get("Careful Spell")?.description).not.toContain("take no damage");
    expect(revised.get("Careful Spell")?.description).toContain("take no damage");
    expect(original.get("Extended Spell")?.description).not.toContain("advantage");
    expect(revised.get("Extended Spell")?.description).toContain("advantage");
    expect(original.get("Subtle Spell")?.description).not.toContain("material components");
    expect(revised.get("Subtle Spell")?.description).toContain("material components");
  });
});
