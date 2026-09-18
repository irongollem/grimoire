import { describe, expect, it } from "vitest";
import {
  buildFactionQueryText,
  buildItemQueryText,
  buildLocationQueryText,
  buildMonsterQueryText,
  buildNpcQueryText,
  buildQueryText,
  factionDetail,
  isSemanticKind,
  itemDetail,
  locationDetail,
  mergeCandidates,
  monsterDetail,
  npcDetail,
  PayloadValidationError,
  SIMILAR_MAX_DISTANCE,
  SUPPORTED_KINDS,
  validatePayload,
  type Candidate,
} from "./matching";

// ── validatePayload ──────────────────────────────────────────────────────────

describe("validatePayload", () => {
  it("accepts a well-formed body", () => {
    const result = validatePayload({
      id: "import-1",
      entities: {
        npcs: [{ ref: "n1", name: "Baelin", data: { race: "Dwarf" } }],
      },
    });
    expect(result.documentImportId).toBe("import-1");
    expect(result.byKind.npcs).toEqual([{ ref: "n1", name: "Baelin", data: { race: "Dwarf" } }]);
  });

  it("rejects a non-object body", () => {
    expect(() => validatePayload(null)).toThrow(PayloadValidationError);
    expect(() => validatePayload("nope")).toThrow(PayloadValidationError);
    expect(() => validatePayload([])).toThrow(PayloadValidationError);
  });

  it("rejects a missing or blank id", () => {
    expect(() => validatePayload({ entities: {} })).toThrow(PayloadValidationError);
    expect(() => validatePayload({ id: "  ", entities: {} })).toThrow(PayloadValidationError);
    expect(() => validatePayload({ id: 5, entities: {} })).toThrow(PayloadValidationError);
  });

  it("rejects a non-object entities field", () => {
    expect(() => validatePayload({ id: "x", entities: [] })).toThrow(PayloadValidationError);
    expect(() => validatePayload({ id: "x", entities: "npcs" })).toThrow(PayloadValidationError);
  });

  it("silently drops kinds outside SUPPORTED_KINDS", () => {
    const result = validatePayload({
      id: "x",
      entities: { npcs: [{ ref: "n1", name: "A", data: {} }], bogus_kind: [{ ref: "z", name: "Z", data: {} }] },
    });
    expect(result.byKind.npcs).toHaveLength(1);
    expect(Object.keys(result.byKind)).toEqual(["npcs"]);
  });

  it("covers every supported kind", () => {
    expect(SUPPORTED_KINDS).toEqual([
      "npcs", "factions", "locations", "encounters", "quests", "monsters", "items", "spells",
    ]);
  });

  it("drops an individual entity with a blank name, keeping the rest", () => {
    const result = validatePayload({
      id: "x",
      entities: {
        npcs: [
          { ref: "n1", name: "   ", data: {} },
          { ref: "n2", name: "Real Name", data: {} },
        ],
      },
    });
    expect(result.byKind.npcs).toEqual([{ ref: "n2", name: "Real Name", data: {} }]);
  });

  it("drops an entity with a non-string ref or non-object data", () => {
    const result = validatePayload({
      id: "x",
      entities: {
        npcs: [
          { ref: 1, name: "A", data: {} },
          { ref: "n2", name: "B", data: "not an object" },
          { ref: "n3", name: "C", data: null },
          { ref: "n4", name: "D", data: {} },
        ],
      },
    });
    expect(result.byKind.npcs).toEqual([{ ref: "n4", name: "D", data: {} }]);
  });

  it("omits a kind whose every entity was invalid, rather than storing an empty array", () => {
    const result = validatePayload({
      id: "x",
      entities: { npcs: [{ ref: "n1", name: "", data: {} }] },
    });
    expect(result.byKind.npcs).toBeUndefined();
  });

  it("throws when the total entity count exceeds the cap", () => {
    const many = Array.from({ length: 301 }, (_, i) => ({ ref: `r${i}`, name: `N${i}`, data: {} }));
    expect(() => validatePayload({ id: "x", entities: { npcs: many } })).toThrow(PayloadValidationError);
  });

  it("accepts exactly the cap", () => {
    const exactly300 = Array.from({ length: 300 }, (_, i) => ({ ref: `r${i}`, name: `N${i}`, data: {} }));
    const result = validatePayload({ id: "x", entities: { npcs: exactly300 } });
    expect(result.byKind.npcs).toHaveLength(300);
  });

  it("throws when one entity's JSON payload exceeds the per-entity size cap", () => {
    const hugeDescription = "x".repeat(20000);
    expect(() =>
      validatePayload({
        id: "x",
        entities: { npcs: [{ ref: "n1", name: "A", data: { description: hugeDescription } }] },
      })
    ).toThrow(PayloadValidationError);
  });
});

// ── isSemanticKind ───────────────────────────────────────────────────────────

describe("isSemanticKind", () => {
  it("is true for the five embeddable kinds and false for the rest", () => {
    expect(isSemanticKind("npcs")).toBe(true);
    expect(isSemanticKind("factions")).toBe(true);
    expect(isSemanticKind("locations")).toBe(true);
    expect(isSemanticKind("monsters")).toBe(true);
    expect(isSemanticKind("items")).toBe(true);
    expect(isSemanticKind("encounters")).toBe(false);
    expect(isSemanticKind("quests")).toBe(false);
    expect(isSemanticKind("spells")).toBe(false);
  });
});

// ── Embed-text mapping ───────────────────────────────────────────────────────

describe("query-text builders", () => {
  it("buildNpcQueryText carries fields through and defaults tags to empty", () => {
    const text = buildNpcQueryText("Baelin Ironforge", { race: "Dwarf", occupation: "Blacksmith" });
    expect(text).toContain("Baelin Ironforge");
    expect(text).toContain("Dwarf Blacksmith");
  });

  it("buildNpcQueryText degrades gracefully with only a name", () => {
    expect(buildNpcQueryText("Baelin", {})).toBe("Baelin.");
  });

  it("buildFactionQueryText carries type/alignment/description", () => {
    const text = buildFactionQueryText("The Iron Concord", { faction_type: "Guild", alignment: "Lawful Neutral" });
    expect(text).toContain("The Iron Concord");
    expect(text).toContain("Guild, Lawful Neutral.");
  });

  it("buildLocationQueryText falls back to the schema default 'other' when location_type is absent", () => {
    const text = buildLocationQueryText("The Rusty Anchor", {});
    expect(text).toBe("The Rusty Anchor. other.");
  });

  it("buildLocationQueryText uses the extracted location_type when present", () => {
    const text = buildLocationQueryText("The Rusty Anchor", { location_type: "tavern" });
    expect(text).toBe("The Rusty Anchor. tavern.");
  });

  it("buildItemQueryText falls back to the schema defaults 'gear'/'mundane' (lowercase, matching the column default literally) when absent", () => {
    const text = buildItemQueryText("Rusty Nail", {});
    expect(text).toBe("Rusty Nail. mundane gear.");
  });

  it("buildItemQueryText honours an explicit requires_attunement and its requirement text", () => {
    const text = buildItemQueryText("Staff of the Woodlands", {
      rarity: "Rare", item_type: "staff", requires_attunement: true,
      attunement_requirements: "by a Druid",
    });
    expect(text).toContain("Requires attunement: by a Druid.");
  });

  it("buildItemQueryText defaults requires_attunement to false when absent, matching the column default", () => {
    const text = buildItemQueryText("Rusty Nail", { attunement_requirements: null });
    expect(text).not.toContain("Requires attunement");
  });

  it("buildMonsterQueryText reads a partial stat_block's challenge_rating", () => {
    const text = buildMonsterQueryText("Owlbear", {
      size: "Large", monster_type: "monstrosity", stat_block: { challenge_rating: "3" },
    });
    expect(text).toBe("Owlbear. Large monstrosity, CR 3.");
  });

  it("buildMonsterQueryText tolerates a malformed (non-object) stat_block without throwing", () => {
    expect(() => buildMonsterQueryText("Owlbear", { stat_block: "not an object" })).not.toThrow();
    expect(buildMonsterQueryText("Owlbear", { stat_block: "not an object" })).toBe("Owlbear.");
  });

  it("buildQueryText dispatches to the right builder per kind", () => {
    expect(buildQueryText("npcs", "Baelin", {})).toBe(buildNpcQueryText("Baelin", {}));
    expect(buildQueryText("factions", "Iron Concord", {})).toBe(buildFactionQueryText("Iron Concord", {}));
    expect(buildQueryText("locations", "Rusty Anchor", {})).toBe(buildLocationQueryText("Rusty Anchor", {}));
    expect(buildQueryText("monsters", "Owlbear", {})).toBe(buildMonsterQueryText("Owlbear", {}));
    expect(buildQueryText("items", "Rusty Nail", {})).toBe(buildItemQueryText("Rusty Nail", {}));
  });

  it("ignores untrusted, non-string field values rather than throwing or coercing them in", () => {
    // `data` is client-supplied JSON re-sent from an untrusted extraction --
    // a field with the wrong runtime type must be treated as absent, never
    // stringified or otherwise coerced into the embed text.
    const text = buildNpcQueryText("Baelin", { race: 12345, occupation: { nested: true } });
    expect(text).toBe("Baelin.");
  });
});

// ── Semantic-tier detail strings ─────────────────────────────────────────────

describe("detail builders", () => {
  it("npcDetail joins just the occupation, and is null when absent", () => {
    expect(npcDetail({ id: "1", name: "A", occupation: "Blacksmith", distance: 0.1 })).toBe("Blacksmith");
    expect(npcDetail({ id: "1", name: "A", occupation: null, distance: 0.1 })).toBeNull();
  });

  it("factionDetail and locationDetail behave the same way for their one field", () => {
    expect(factionDetail({ id: "1", name: "A", faction_type: "Guild", distance: 0 })).toBe("Guild");
    expect(locationDetail({ id: "1", name: "A", location_type: "tavern", distance: 0 })).toBe("tavern");
  });

  it("monsterDetail puts CR before type and omits either half cleanly when absent", () => {
    expect(monsterDetail({ id: "1", name: "A", monster_type: "humanoid", challenge_rating: "1/4", distance: 0 }))
      .toBe("CR 1/4 · humanoid");
    expect(monsterDetail({ id: "1", name: "A", monster_type: "humanoid", challenge_rating: null, distance: 0 }))
      .toBe("humanoid");
    expect(monsterDetail({ id: "1", name: "A", monster_type: null, challenge_rating: null, distance: 0 }))
      .toBeNull();
  });

  it("itemDetail puts rarity before type", () => {
    expect(itemDetail({ id: "1", name: "A", item_type: "gear", rarity: "mundane", distance: 0 }))
      .toBe("mundane · gear");
  });
});

// ── Merge ────────────────────────────────────────────────────────────────────

function candidate(targetId: string, matchKind: Candidate["matchKind"] = "exact"): Candidate {
  return { targetId, source: "campaign", name: targetId, matchKind, detail: null, distance: null };
}

describe("mergeCandidates", () => {
  it("keeps ALL name candidates uncapped -- five same-named rows all survive", () => {
    const names = Array.from({ length: 6 }, (_, i) => candidate(`n${i}`));
    const merged = mergeCandidates(names, []);
    expect(merged).toHaveLength(6);
  });

  it("appends similar candidates after every name candidate, in order", () => {
    const names = [candidate("n1")];
    const similar = [candidate("s1", "similar"), candidate("s2", "similar")];
    const merged = mergeCandidates(names, similar);
    expect(merged.map((c) => c.targetId)).toEqual(["n1", "s1", "s2"]);
  });

  it("caps similar candidates at 3 regardless of how many name candidates exist", () => {
    const names = Array.from({ length: 6 }, (_, i) => candidate(`n${i}`));
    const similar = Array.from({ length: 5 }, (_, i) => candidate(`s${i}`, "similar"));
    const merged = mergeCandidates(names, similar);
    expect(merged).toHaveLength(9); // all 6 name + 3 similar
    expect(merged.filter((c) => c.matchKind === "similar")).toHaveLength(3);
  });

  it("drops a similar hit whose targetId a name candidate already found", () => {
    const names = [candidate("shared")];
    const similar = [candidate("shared", "similar"), candidate("s2", "similar")];
    const merged = mergeCandidates(names, similar);
    expect(merged.map((c) => c.targetId)).toEqual(["shared", "s2"]);
    expect(merged[0].matchKind).toBe("exact"); // the name-tier copy wins, not the similar one
  });

  it("returns just the similar tier, capped, when there are no name candidates", () => {
    const similar = Array.from({ length: 4 }, (_, i) => candidate(`s${i}`, "similar"));
    expect(mergeCandidates([], similar)).toHaveLength(3);
  });
});

// ── SIMILAR_MAX_DISTANCE ─────────────────────────────────────────────────────

describe("SIMILAR_MAX_DISTANCE", () => {
  it("has a distinct calibrated threshold for every semantic kind", () => {
    expect(SIMILAR_MAX_DISTANCE).toEqual({
      npcs: 0.13, factions: 0.20, locations: 0.22, monsters: 0.07, items: 0.09,
    });
  });
});
