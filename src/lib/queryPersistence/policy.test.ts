import { describe, expect, it } from "vitest";
import { isStaticContent, LIVE_ROOT_KEYS, persistClass } from "./policy";

describe("isStaticContent", () => {
  it("matches a key that is exactly a prefix", () => {
    expect(isStaticContent(["metamagicOptions"])).toBe(true);
  });

  it("matches a longer key that starts with a prefix", () => {
    expect(isStaticContent(["library-monster-index", ["srd"], "2024"])).toBe(true);
    expect(isStaticContent(["library_rules", "2014"])).toBe(true);
  });

  it("does not match a different root", () => {
    expect(isStaticContent(["monsters"])).toBe(false);
    expect(isStaticContent(["plans"])).toBe(false);
    expect(isStaticContent(["library-monster-art"])).toBe(false);
    expect(isStaticContent(["library-monsters", "srd_owlbear"])).toBe(false);
  });

  it("does not match a root that merely shares a string prefix", () => {
    expect(isStaticContent(["library-monster-index-x"])).toBe(false);
  });

  it("does not match when the prefix is not first", () => {
    expect(isStaticContent(["x", "library-monster-index"])).toBe(false);
  });

  it("does not match an empty key", () => {
    expect(isStaticContent([])).toBe(false);
  });
});

describe("persistClass", () => {
  it("puts library content in the static class", () => {
    expect(persistClass(["library-monster-index", "x"])).toBe("static");
  });

  it("puts every root the live channel reconciles in the live class", () => {
    for (const root of ["quests", "npcs", "campaigns", "quest_runtime_state", "notes"]) {
      expect(LIVE_ROOT_KEYS).toContain(root);
      expect(persistClass([root, "campaign-1"])).toBe("live");
    }
  });

  it("keeps searched, filtered and id-set shapes of a live root off disk", () => {
    expect(persistClass(["monsters", "browse", ["srd-2024"], "2024", "c1", "owl"])).toBeNull();
    expect(persistClass(["spells", "by-ids", ["a"], []])).toBeNull();
    expect(persistClass(["monsters", "player-by-ids", ["a"]])).toBeNull();
    expect(persistClass(["monsters", "m1"])).toBe("live");
  });

  it("keeps invite tokens off disk", () => {
    expect(LIVE_ROOT_KEYS).toContain("campaign-invites");
    expect(persistClass(["campaign-invites", "c1"])).toBeNull();
  });

  it("persists nothing else", () => {
    expect(persistClass(["plans"])).toBeNull();
    expect(persistClass(["library-monsters", "srd_owlbear"])).toBeNull();
    expect(persistClass([])).toBeNull();
    expect(persistClass([["quests"]])).toBeNull();
  });
});
