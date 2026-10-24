import { describe, expect, it } from "vitest";
import type { PartyInventoryItem } from "@/types/inventory.types";
import { experimentChatMessage, experimentEntries, experimentPack, parseExperimentResult } from "./experiment";

describe("parseExperimentResult", () => {
  it("reads a match", () => {
    expect(parseExperimentResult({ result: "match", recipe_id: "r1", name: "Dagger" })).toEqual({
      result: "match",
      recipeId: "r1",
      name: "Dagger",
    });
  });
  it("reads both near-miss hints", () => {
    expect(parseExperimentResult({ result: "near", hint: "missing" })).toEqual({ result: "near", hint: "missing" });
    expect(parseExperimentResult({ result: "near", hint: "extra" })).toEqual({ result: "near", hint: "extra" });
  });
  it("reads none", () => {
    expect(parseExperimentResult({ result: "none" })).toEqual({ result: "none" });
  });
  it.each([null, "none", [], {}, { result: "near" }, { result: "near", hint: "x" }, { result: "match", name: "a" }, { result: "list" }])(
    "throws on %j",
    (bad) => {
      expect(() => parseExperimentResult(bad)).toThrow();
    },
  );
});

describe("experimentChatMessage", () => {
  it("names who found what", () => {
    expect(experimentChatMessage("Nessa", "Frostbrand Dagger")).toBe("🔍 **Nessa** discovered **Frostbrand Dagger** by experimenting.");
  });
});

describe("experimentPack and experimentEntries", () => {
  const row = (o: Partial<PartyInventoryItem>) =>
    ({ id: "r", name: "Iron", quantity: 1, library_item_id: null, item_id: "i1", is_ruined: false, is_equipped: false, is_container: false, ...o }) as PartyInventoryItem;

  it("offers only rows a craft could spend", () => {
    const pack = experimentPack([
      row({ id: "ok" }),
      row({ id: "ruined", is_ruined: true }),
      row({ id: "worn", is_equipped: true }),
      row({ id: "bag", is_container: true }),
    ]);
    expect(pack.map((r) => r.id)).toEqual(["ok"]);
  });

  it("leaves out rows that reference no item, which no ingredient could match", () => {
    const pack = experimentPack([row({ id: "ok" }), row({ id: "lib", item_id: null, library_item_id: "srd_rope" }), row({ id: "nameonly", item_id: null })]);
    expect(pack.map((r) => r.id)).toEqual(["ok", "lib"]);
  });

  it("keeps the order laid out and drops rows that have left the pack", () => {
    const pack = [row({ id: "a", name: "Iron" }), row({ id: "b", name: "Wood" })];
    const entries = experimentEntries(["b", "gone", "a"], pack, []);
    expect(entries.map((e) => e.name)).toEqual(["Wood", "Iron"]);
  });
});
