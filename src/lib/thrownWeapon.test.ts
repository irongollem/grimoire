import { describe, it, expect } from "vitest";
import { isThrownWeapon } from "@/lib/thrownWeapon";

describe("isThrownWeapon", () => {
  it("trusts a vault item's thrown property", () => {
    expect(isThrownWeapon("Dagger", { properties: ["finesse", "light", "thrown"] })).toBe(true);
  });

  it("returns false for a vault weapon without the thrown property", () => {
    expect(isThrownWeapon("Longsword", { properties: ["versatile"] })).toBe(false);
  });

  it("does NOT name-match when a vault item is present (data is authoritative)", () => {
    // A vault 'Longspear' is not thrown even though its name contains 'spear'.
    expect(isThrownWeapon("Longspear", { properties: ["reach", "heavy"] })).toBe(false);
  });

  it("name-matches an item-less Javelin", () => {
    expect(isThrownWeapon("Javelin", null)).toBe(true);
  });

  it("name-matches an item-less Spear", () => {
    expect(isThrownWeapon("Spear", null)).toBe(true);
  });

  it("name-matches case-insensitively", () => {
    expect(isThrownWeapon("HANDAXE", null)).toBe(true);
  });

  it("returns false for an item-less non-thrown weapon", () => {
    expect(isThrownWeapon("Longsword", null)).toBe(false);
  });

  it("does NOT substring-match an item-less 'Longspear' against 'spear'", () => {
    expect(isThrownWeapon("Longspear", null)).toBe(false);
  });

  it("word-boundary matches an item-less 'Javelin of Lightning'", () => {
    expect(isThrownWeapon("Javelin of Lightning", null)).toBe(true);
  });

  it("word-boundary matches an item-less 'Spear +1'", () => {
    expect(isThrownWeapon("Spear +1", null)).toBe(true);
  });
});
