import { describe, it, expect } from "vitest";
import { acceptsAsMaterial, acceptsAsOutput, benchBudget, buildUserContent, draftView, keyCandidates, rarityBand, type CandidateRow } from "./candidates.ts";
import type { InventionBenchEntry, InventionDraft } from "./types.ts";

function row(over: Partial<CandidateRow> & { name: string }): CandidateRow {
  return { source: "custom", id: `id-${over.name}`, rarity: "common", item_type: "gear", cost: "10 gp", requires_attunement: false, charges: null, spell_count: 0, ...over };
}
function bench(over: Partial<InventionBenchEntry> = {}): InventionBenchEntry {
  return { row_id: "r1", dishes: 2, item_id: "it1", library_item_id: null, name: "Silver dust", rarity: "uncommon", item_type: "crafting_material", cost: "50 gp", tags: [], ...over };
}

describe("rarityBand", () => {
  it("runs from mundane to the ceiling", () => {
    expect(rarityBand("common")).toEqual(["mundane", "common"]);
    expect(rarityBand("legendary")).toHaveLength(6);
  });
});

describe("acceptsAsOutput", () => {
  it("keeps lane items within the ceiling", () => {
    expect(acceptsAsOutput(row({ name: "Lantern" }), "tinkering", "common")).toBe(true);
  });
  it("drops other lanes, rarer items, spells and bad attunement", () => {
    expect(acceptsAsOutput(row({ name: "Pie", item_type: "provision" }), "tinkering", "common")).toBe(false);
    expect(acceptsAsOutput(row({ name: "Gem", rarity: "rare" }), "tinkering", "common")).toBe(false);
    expect(acceptsAsOutput(row({ name: "Wand of X", spell_count: 1 }), "tinkering", "legendary")).toBe(false);
    expect(acceptsAsOutput(row({ name: "Odd", requires_attunement: true, rarity: "common" }), "tinkering", "legendary")).toBe(false);
    expect(acceptsAsOutput(row({ name: "Sword +3", rarity: "uncommon", item_type: "gear" }), "tinkering", "legendary")).toBe(false);
  });
  it("drops a mundane magic-only type", () => {
    expect(acceptsAsOutput(row({ name: "Plain ring", item_type: "wondrous_item", rarity: "mundane" }), "tinkering", "common")).toBe(false);
  });
});

describe("acceptsAsMaterial", () => {
  it("accepts material types only", () => {
    expect(acceptsAsMaterial(row({ name: "Ore", item_type: "crafting_material" }))).toBe(true);
    expect(acceptsAsMaterial(row({ name: "Sword", item_type: "weapon" }))).toBe(false);
  });
});

describe("keyCandidates", () => {
  it("dedupes by name custom-first, filters, caps and keys", () => {
    const rows = [
      row({ name: "Lamp", id: "c1" }),
      row({ name: "lamp", id: "l1", source: "library" }),
      row({ name: "Pie", item_type: "provision" }),
      row({ name: "Gear A" }),
      row({ name: "Gear B", source: "library" }),
    ];
    const out = keyCandidates(rows, (r) => r.item_type === "gear", "o", 2);
    expect(out.map((c) => c.key)).toEqual(["o1", "o2"]);
    expect(out[0].ref).toEqual({ item_id: "c1" });
    expect(out[1].name).toBe("Gear A");
  });
  it("lets a rejected custom row leave its name to an acceptable library row", () => {
    const rows = [
      row({ name: "Lantern", id: "c1", item_type: "wondrous_item" }),
      row({ name: "Lantern", id: "srd_lantern", source: "library" }),
    ];
    const out = keyCandidates(rows, (r) => r.item_type === "gear", "o");
    expect(out.map((c) => c.ref)).toEqual([{ library_item_id: "srd_lantern" }]);
  });
  it("makes a library ref for library rows", () => {
    const [c] = keyCandidates([row({ name: "Rope", source: "library", id: "srd_rope" })], () => true, "m");
    expect(c.key).toBe("m1");
    expect(c.ref).toEqual({ library_item_id: "srd_rope" });
  });
});

describe("benchBudget", () => {
  it("takes the rarest ingredient as the ceiling and prices by dish", () => {
    expect(benchBudget([bench()], 2)).toEqual({ ceiling: "uncommon", valueLimitCp: 20000 });
  });
});

describe("buildUserContent", () => {
  const base = { discipline: "tinkering" as const, valueMultiple: 2, bench: [bench()], outputCandidates: [], materialCandidates: [], wish: null, revision: null };
  it("states the limits in materials mode and leaves out material candidates", () => {
    const j = JSON.parse(buildUserContent({ ...base, mode: "materials" }));
    expect(j.rarity_ceiling).toBe("uncommon");
    expect(j.value_limit_cp).toBe(20000);
    expect(j.bench[0]).toEqual({ name: "Silver dust", rarity: "uncommon", cost: "50 gp", quantity: 2 });
    expect(j.material_candidates).toBeUndefined();
  });
  it("wraps the wish and sends only keys in idea mode", () => {
    const cand = keyCandidates([row({ name: "Lamp", id: "secret-uuid" })], () => true, "o");
    const text = buildUserContent({ ...base, mode: "idea", wish: "a lamp", outputCandidates: cand, materialCandidates: [] });
    const j = JSON.parse(text);
    expect(j.wish).toContain("<user_input>");
    expect(j.rarity_ceiling).toBe("legendary");
    expect(j.value_limit_cp).toBeUndefined();
    expect(j.output_candidates[0].id).toBe("o1");
    expect(text).not.toContain("secret-uuid");
  });
  it("wraps the revision note and the DM note, without ids", () => {
    const draft = {
      item: { ref: { item_id: "uuid-1" }, new: null, name: "Lamp", rarity: "common", item_type: "gear", value_cp: 100 },
      mechanics: [],
      quantity: 1,
      recipe: { name: "Lamp", description: "d", dc: 10, requires_proficiency: false, requires_tools: true, special_requirement: null, crafting_time: 1, crafting_time_unit: "hours" },
      ingredients: [{ ref: { item_id: "uuid-2" }, new: null, name: "Oil", rarity: "mundane", value_cp: 5, quantity: 1 }],
    } as unknown as InventionDraft;
    const text = buildUserContent({ ...base, mode: "idea", wish: "a lamp", revision: { previous: draft, note: "brighter", dmNote: "too cheap" } });
    const j = JSON.parse(text);
    expect(j.revision_note).toContain("<user_input>\nbrighter");
    expect(j.dm_note).toContain("too cheap");
    expect(text).not.toContain("uuid-");
    expect(draftView(draft).item).toEqual({ existing_item: "Lamp", rarity: "common", item_type: "gear" });
  });
});
