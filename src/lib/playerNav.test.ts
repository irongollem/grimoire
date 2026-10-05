import { describe, it, expect } from "vitest";
import { ALL_PLAYER_NAV, isNavItemActive } from "./playerNav";

describe("isNavItemActive", () => {
  it("keeps /play exact", () => {
    expect(isNavItemActive("/play", "/play")).toBe(true);
    expect(isNavItemActive("/play", "/play/character")).toBe(false);
  });
  it("lights the sheet tab on its sub-routes", () => {
    for (const p of ["/play/character", "/play/character/edit", "/play/character/levelup"]) {
      expect(isNavItemActive("/play/character", p)).toBe(true);
    }
  });
  it("matches on a segment boundary", () => {
    expect(isNavItemActive("/play/character", "/play/characterfoo")).toBe(false);
  });
});

describe("ALL_PLAYER_NAV", () => {
  it("has unique ids and paths", () => {
    expect(new Set(ALL_PLAYER_NAV.map((i) => i.id)).size).toBe(ALL_PLAYER_NAV.length);
    expect(new Set(ALL_PLAYER_NAV.map((i) => i.to)).size).toBe(ALL_PLAYER_NAV.length);
  });
});
