import { describe, it, expect } from "vitest";
import { resolveGeneratedEntities, type EntityPools } from "./resolveGeneratedEntities";

type EntityRefs = { npcs?: string[]; locations?: string[]; factions?: string[] };

function makeHook(overrides: EntityRefs): EntityRefs {
  return { npcs: undefined, locations: undefined, factions: undefined, ...overrides };
}

const EMPTY_POOLS: EntityPools = { npcs: [], locations: [], factions: [] };

describe("resolveGeneratedEntities", () => {
  it("resolves an exact name match per kind", () => {
    const pools: EntityPools = {
      npcs: [{ id: "n-1", name: "Elowen" }],
      locations: [{ id: "l-1", name: "Thornwatch Keep" }],
      factions: [{ id: "f-1", name: "The Ashen Circle" }],
    };
    const result = resolveGeneratedEntities(
      makeHook({ npcs: ["Elowen"], locations: ["Thornwatch Keep"], factions: ["The Ashen Circle"] }),
      pools,
    );
    expect(result).toEqual([
      { kind: "npc", name: "Elowen", id: "n-1" },
      { kind: "location", name: "Thornwatch Keep", id: "l-1" },
      { kind: "faction", name: "The Ashen Circle", id: "f-1" },
    ]);
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    const pools: EntityPools = {
      npcs: [{ id: "n-1", name: "Elowen" }],
      locations: [],
      factions: [],
    };
    const result = resolveGeneratedEntities(makeHook({ npcs: ["  elOWEN  "] }), pools);
    expect(result).toEqual([{ kind: "npc", name: "elOWEN", id: "n-1" }]);
  });

  it("preserves an unmatched name with a null id instead of dropping it", () => {
    const pools: EntityPools = { npcs: [{ id: "n-1", name: "Elowen" }], locations: [], factions: [] };
    const result = resolveGeneratedEntities(makeHook({ npcs: ["A Stranger the AI Invented"] }), pools);
    expect(result).toEqual([{ kind: "npc", name: "A Stranger the AI Invented", id: null }]);
  });

  it("treats absent arrays as empty rather than throwing", () => {
    const pools: EntityPools = {
      npcs: [{ id: "n-1", name: "Elowen" }],
      locations: [{ id: "l-1", name: "Thornwatch Keep" }],
      factions: [{ id: "f-1", name: "The Ashen Circle" }],
    };
    expect(resolveGeneratedEntities(makeHook({}), pools)).toEqual([]);
  });

  it("dedupes duplicate names within one hook, by kind + lowercased name", () => {
    const pools: EntityPools = { npcs: [{ id: "n-1", name: "Elowen" }], locations: [], factions: [] };
    const result = resolveGeneratedEntities(makeHook({ npcs: ["Elowen", "elowen", "  Elowen  "] }), pools);
    expect(result).toEqual([{ kind: "npc", name: "Elowen", id: "n-1" }]);
  });

  it("does not dedupe the same name across different kinds", () => {
    const pools: EntityPools = {
      npcs: [{ id: "n-1", name: "Ravenwatch" }],
      locations: [{ id: "l-1", name: "Ravenwatch" }],
      factions: [],
    };
    const result = resolveGeneratedEntities(makeHook({ npcs: ["Ravenwatch"], locations: ["Ravenwatch"] }), pools);
    expect(result).toEqual([
      { kind: "npc", name: "Ravenwatch", id: "n-1" },
      { kind: "location", name: "Ravenwatch", id: "l-1" },
    ]);
  });

  it("returns every name unmatched when the pools are empty", () => {
    const result = resolveGeneratedEntities(
      makeHook({ npcs: ["Elowen"], locations: ["Thornwatch Keep"], factions: ["The Ashen Circle"] }),
      EMPTY_POOLS,
    );
    expect(result).toEqual([
      { kind: "npc", name: "Elowen", id: null },
      { kind: "location", name: "Thornwatch Keep", id: null },
      { kind: "faction", name: "The Ashen Circle", id: null },
    ]);
  });

  it("first pool entry wins when two rows share a name", () => {
    const pools: EntityPools = {
      npcs: [
        { id: "n-1", name: "Elowen" },
        { id: "n-2", name: "Elowen" },
      ],
      locations: [],
      factions: [],
    };
    const result = resolveGeneratedEntities(makeHook({ npcs: ["Elowen"] }), pools);
    expect(result).toEqual([{ kind: "npc", name: "Elowen", id: "n-1" }]);
  });
});
