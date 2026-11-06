import { describe, expect, it } from "vitest";
import { gameSystemEdition, isGameSystemKey, rulesetContextKey } from "./gameSystem";

describe("gameSystemEdition", () => {
  it("maps each 5e system to its edition", () => {
    expect(gameSystemEdition("dnd5e-2014")).toBe("2014");
    expect(gameSystemEdition("dnd5e-2024")).toBe("2024");
  });
  // Bug: Generic quietly played 2014 (the old `=== "2024" ? "2024" : "2014"` fallback).
  it.each(["generic", null, undefined, "2014", "pathfinder"])("has no edition for %j", (s) => {
    expect(gameSystemEdition(s)).toBeUndefined();
  });
});

describe("rulesetContextKey", () => {
  it("names the context row of a 5e system and none for Generic", () => {
    expect(rulesetContextKey("dnd5e-2014")).toBe("ruleset_context_2014");
    expect(rulesetContextKey("dnd5e-2024")).toBe("ruleset_context_2024");
    expect(rulesetContextKey("generic")).toBeUndefined();
  });
});

describe("isGameSystemKey", () => {
  it("accepts the three systems and nothing else", () => {
    expect(["dnd5e-2014", "dnd5e-2024", "generic"].every(isGameSystemKey)).toBe(true);
    expect([ "2014", "", null, 5 ].some(isGameSystemKey)).toBe(false);
  });
});
