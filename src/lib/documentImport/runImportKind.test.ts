import { describe, expect, it, vi } from "vitest";
import {
  orderLocationsParentsFirst,
  runImportKind,
  runLocationsImportKind,
  type LocationParentCandidate,
  type RunImportKindDeps,
  type RunLocationsImportKindDeps,
} from "./runImportKind";
import type { ImportDecision } from "./entityMatching";
import type { ExtractedLocation, ExtractedMonster, ExtractedNpc } from "@/types/documentImport.types";
import type { AiProvenance } from "@/ai/provenance";

const CAMPAIGN_ID = "11111111-1111-1111-1111-111111111111";

const PROVENANCE: AiProvenance = {
  generatorType: "document_import",
  provider: "anthropic",
  model: "claude-test",
  generatedAt: "2026-08-24T00:00:00.000Z",
  edited: false,
};

const CREATE: ImportDecision = { action: "create" };
const GENERATE: ImportDecision = { action: "generate" };
const IGNORE: ImportDecision = { action: "ignore" };

function entity<T>(ref: string, data: T, page: number | null = 1) {
  return { ref, page, confidence: "complete" as const, data };
}

function decisions(entries: readonly [string, ImportDecision][]): ReadonlyMap<string, ImportDecision> {
  return new Map(entries);
}

/** A deps object whose every function fails the test if called — callers
 *  override only the ones a given scenario actually exercises. */
function fakeDeps(overrides: Partial<RunImportKindDeps> = {}): RunImportKindDeps {
  return {
    insertRow: vi.fn(async () => {
      throw new Error("insertRow should not be called in this test");
    }),
    generateMonster: vi.fn(async () => {
      throw new Error("generateMonster should not be called in this test");
    }),
    ...overrides,
  };
}

describe("runImportKind", () => {
  it("inserts every 'create'-decided row and reports their ids", async () => {
    const entities = [entity("a", { name: "Kobold" }), entity("b", { name: "Owlbear" })];
    let call = 0;
    const insertRow = vi.fn(async () => ({ status: "inserted" as const, id: `id-${++call}` }));
    const deps = fakeDeps({ insertRow });

    const result = await runImportKind(
      { kind: "monsters", entities, decisions: decisions([["a", CREATE], ["b", CREATE]]), campaignId: CAMPAIGN_ID, provenance: PROVENANCE },
      deps,
    );

    expect(insertRow).toHaveBeenCalledTimes(2);
    expect(result.report).toEqual({
      kind: "monsters",
      planned: 2,
      imported: 2,
      stoppedAtQuota: false,
      rows: [
        { ref: "a", status: "inserted", id: "id-1" },
        { ref: "b", status: "inserted", id: "id-2" },
      ],
    });
    expect(result.insertedIds).toEqual(new Map([["a", "id-1"], ["b", "id-2"]]));
  });

  it("plans nothing for a 'link' or 'ignore' decision, and nothing for an entity absent from the map", async () => {
    const entities = [entity("a", { name: "Kobold" }), entity("b", { name: "Owlbear" }), entity("c", { name: "Troll" }), entity("d", { name: "Ghost" })];
    const insertRow = vi.fn(async () => ({ status: "inserted" as const, id: "new-id" }));
    const deps = fakeDeps({ insertRow });

    const result = await runImportKind(
      {
        kind: "monsters",
        entities,
        decisions: decisions([
          ["a", CREATE],
          ["b", { action: "link", candidate: { targetId: "mon-1", source: "campaign", name: "Owlbear", matchKind: "exact", detail: null, distance: null } }],
          ["c", IGNORE],
          // "d" is absent from the map entirely.
        ]),
        campaignId: CAMPAIGN_ID,
        provenance: PROVENANCE,
      },
      deps,
    );

    expect(insertRow).toHaveBeenCalledTimes(1);
    expect(result.report.planned).toBe(1);
    expect(result.insertedIds.has("a")).toBe(true);
    expect(result.insertedIds.has("b")).toBe(false);
    expect(result.insertedIds.has("d")).toBe(false);
  });

  it("stops at the first quota_exceeded outcome and reports the rest as not attempted", async () => {
    const entities = [entity("a", { name: "One" }), entity("b", { name: "Two" }), entity("c", { name: "Three" })];
    let call = 0;
    const insertRow = vi.fn(async () => {
      call++;
      if (call === 2) return { status: "quota_exceeded" as const };
      return { status: "inserted" as const, id: `id-${call}` };
    });
    const deps = fakeDeps({ insertRow });

    const result = await runImportKind(
      { kind: "monsters", entities, decisions: decisions([["a", CREATE], ["b", CREATE], ["c", CREATE]]), campaignId: CAMPAIGN_ID, provenance: PROVENANCE },
      deps,
    );

    expect(insertRow).toHaveBeenCalledTimes(2); // the third row is never attempted
    expect(result.report.planned).toBe(3);
    expect(result.report.imported).toBe(1);
    expect(result.report.stoppedAtQuota).toBe(true);
    expect(result.report.rows).toEqual([
      { ref: "a", status: "inserted", id: "id-1" },
      { ref: "b", status: "quota_exceeded" },
      { ref: "c", status: "not_attempted" },
    ]);
  });

  it("records a failed row and keeps going", async () => {
    const entities = [entity("a", { name: "One" }), entity("b", { name: "Two" })];
    const insertRow = vi
      .fn()
      .mockResolvedValueOnce({ status: "failed", message: "boom" })
      .mockResolvedValueOnce({ status: "inserted", id: "id-2" });
    const deps = fakeDeps({ insertRow });

    const result = await runImportKind(
      { kind: "monsters", entities, decisions: decisions([["a", CREATE], ["b", CREATE]]), campaignId: CAMPAIGN_ID, provenance: PROVENANCE },
      deps,
    );

    expect(insertRow).toHaveBeenCalledTimes(2);
    expect(result.report.imported).toBe(1);
    expect(result.report.rows[0]).toEqual({ ref: "a", status: "failed", message: "boom" });
  });

  it("captures links/linkLists/questSpine only for a 'create'-decided (planned) entity", async () => {
    const npc: ExtractedNpc = { name: "Reyes", faction_name: "The Watch", location_name: "The Rusty Anchor" };
    const entities = [entity("a", npc)];
    const insertRow = vi.fn(async () => ({ status: "inserted" as const, id: "npc-1" }));
    const deps = fakeDeps({ insertRow });

    const result = await runImportKind(
      { kind: "npcs", entities, decisions: decisions([["a", CREATE]]), campaignId: CAMPAIGN_ID, provenance: PROVENANCE },
      deps,
    );

    const captured = result.linkedEntities.get("a");
    expect(captured?.links).toEqual({ faction_name: "The Watch", npc_location_name: "The Rusty Anchor" });
    expect(captured?.linkLists).toEqual({});
    expect(captured?.questSpine).toBeUndefined();
    expect(captured?.row).toMatchObject({ name: "Reyes" });
  });

  it("captures no linkedEntities entry for a 'link', 'ignore', or 'generate' decision", async () => {
    const entities = [entity("a", { name: "Owlbear" } satisfies ExtractedMonster), entity("b", { name: "Grell" } satisfies ExtractedMonster)];
    const insertRow = vi.fn(async () => ({ status: "inserted" as const, id: "should-not-happen" }));
    const generateMonster = vi.fn(async () => ({ status: "inserted" as const, id: "gen-1" }));
    const deps = fakeDeps({ insertRow, generateMonster });

    const result = await runImportKind(
      {
        kind: "monsters",
        entities,
        decisions: decisions([
          ["a", { action: "link", candidate: { targetId: "mon-1", source: "campaign", name: "Owlbear", matchKind: "exact", detail: null, distance: null } }],
          ["b", GENERATE],
        ]),
        campaignId: CAMPAIGN_ID,
        provenance: PROVENANCE,
      },
      deps,
    );

    expect(result.linkedEntities.size).toBe(0);
    expect(result.insertedIds).toEqual(new Map([["b", "gen-1"]]));
  });

  describe("the 'generate' decision (monsters only)", () => {
    it("sends a 'generate'-decided monster through deps.generateMonster instead of insertRow", async () => {
      const grell: ExtractedMonster = { name: "Grell" };
      const entities = [entity("a", grell)];
      const generateMonster = vi.fn(async () => ({ status: "inserted" as const, id: "gen-1" }));
      const insertRow = vi.fn(async () => ({ status: "inserted" as const, id: "should-not-happen" }));
      const deps = fakeDeps({ generateMonster, insertRow });

      const result = await runImportKind(
        { kind: "monsters", entities, decisions: decisions([["a", GENERATE]]), campaignId: CAMPAIGN_ID, provenance: PROVENANCE },
        deps,
      );

      expect(generateMonster).toHaveBeenCalledTimes(1);
      expect(generateMonster).toHaveBeenCalledWith(grell);
      expect(insertRow).not.toHaveBeenCalled();
      expect(result.report).toEqual({
        kind: "monsters",
        planned: 1,
        imported: 1,
        stoppedAtQuota: false,
        rows: [{ ref: "a", status: "inserted", id: "gen-1" }],
      });
      expect(result.insertedIds).toEqual(new Map([["a", "gen-1"]]));
    });

    it("interleaves create and generate attempts in the entities' own order for quota accounting", async () => {
      // "b" (generate) trips quota — "c" (create) must never be attempted,
      // exactly as a create tripping it would stop a later generate.
      const entities = [entity("a", { name: "One" }), entity("b", { name: "Grell" }), entity("c", { name: "Three" })];
      const insertRow = vi.fn(async () => ({ status: "inserted" as const, id: "insert-id" }));
      const generateMonster = vi.fn(async () => ({ status: "quota_exceeded" as const }));
      const deps = fakeDeps({ insertRow, generateMonster });

      const result = await runImportKind(
        {
          kind: "monsters",
          entities,
          decisions: decisions([["a", CREATE], ["b", GENERATE], ["c", CREATE]]),
          campaignId: CAMPAIGN_ID,
          provenance: PROVENANCE,
        },
        deps,
      );

      expect(insertRow).toHaveBeenCalledTimes(1); // only "a"
      expect(generateMonster).toHaveBeenCalledTimes(1); // "b" trips quota
      expect(result.report.rows).toEqual([
        { ref: "a", status: "inserted", id: "insert-id" },
        { ref: "b", status: "quota_exceeded" },
        { ref: "c", status: "not_attempted" },
      ]);
      expect(result.report.stoppedAtQuota).toBe(true);
    });

    it("ignores a 'generate' decision for a non-monster kind rather than calling deps.generateMonster", async () => {
      const entities = [entity("a", { name: "Reyes" } satisfies ExtractedNpc)];
      const generateMonster = vi.fn(async () => ({ status: "inserted" as const, id: "should-not-happen" }));
      const deps = fakeDeps({ generateMonster });

      const result = await runImportKind(
        { kind: "npcs", entities, decisions: decisions([["a", GENERATE]]), campaignId: CAMPAIGN_ID, provenance: PROVENANCE },
        deps,
      );

      expect(generateMonster).not.toHaveBeenCalled();
      expect(result.report.planned).toBe(0);
    });
  });
});

// ── locations: parent resolution AT INSERT (guard_location_room_parent) ──────

function loc(ref: string, data: ExtractedLocation) {
  return entity(ref, data);
}

describe("orderLocationsParentsFirst", () => {
  it("moves a room after its dungeon when the dungeon printed later on the page", () => {
    const entities = [
      loc("room", { name: "M1. Tool Room", location_type: "room", parent_name: "Sunless Citadel" }),
      loc("dungeon", { name: "Sunless Citadel", location_type: "dungeon" }),
    ];
    const order = orderLocationsParentsFirst(entities).map((e) => e.ref);
    expect(order).toEqual(["dungeon", "room"]);
  });

  it("keeps a room after its dungeon when the dungeon already printed first (order must not matter either way)", () => {
    const entities = [
      loc("dungeon", { name: "Sunless Citadel", location_type: "dungeon" }),
      loc("room", { name: "M1. Tool Room", location_type: "room", parent_name: "Sunless Citadel" }),
    ];
    const order = orderLocationsParentsFirst(entities).map((e) => e.ref);
    expect(order).toEqual(["dungeon", "room"]);
  });

  it("never hangs on a parent cycle — breaks the tie by falling back to original order", () => {
    const entities = [
      loc("a", { name: "A", location_type: "room", parent_name: "B" }),
      loc("b", { name: "B", location_type: "room", parent_name: "A" }),
    ];
    const order = orderLocationsParentsFirst(entities).map((e) => e.ref);
    expect(order).toEqual(["a", "b"]); // no ordering can satisfy both — original order, not a hang
  });

  it("leaves a self-referencing entity in place rather than treating itself as its own parent", () => {
    const entities = [loc("a", { name: "A", location_type: "building", parent_name: "A" })];
    expect(orderLocationsParentsFirst(entities).map((e) => e.ref)).toEqual(["a"]);
  });
});

describe("runLocationsImportKind", () => {
  const CREATE: ImportDecision = { action: "create" };

  function fakeLocationDeps(overrides: Partial<RunLocationsImportKindDeps> = {}): RunLocationsImportKindDeps {
    let call = 0;
    return {
      insertRow: vi.fn(async () => ({ status: "inserted" as const, id: `loc-${++call}` })),
      ...overrides,
    };
  }

  it("resolves a room's parent_name against a dungeon created earlier in the very same batch", async () => {
    const entities = [
      loc("dungeon", { name: "Sunless Citadel", location_type: "dungeon" }),
      loc("room", { name: "M1. Tool Room", location_type: "room", parent_name: "Sunless Citadel" }),
    ];
    const insertRow = vi.fn(async (row: Record<string, unknown>) => ({ status: "inserted" as const, id: row.name === "Sunless Citadel" ? "dungeon-id" : "room-id" }));

    const result = await runLocationsImportKind(
      { entities, decisions: decisions([["dungeon", CREATE], ["room", CREATE]]), campaignId: CAMPAIGN_ID, provenance: PROVENANCE, existingLocations: [] },
      { insertRow },
    );

    const roomCall = insertRow.mock.calls.find((c) => (c[0] as Record<string, unknown>).name === "M1. Tool Room")!;
    expect((roomCall[0] as Record<string, unknown>).parent_id).toBe("dungeon-id");
    expect((roomCall[0] as Record<string, unknown>).location_type).toBe("room"); // never downgraded — it resolved
    expect(result.parentFallbackMessages).toEqual([]);
  });

  it("resolves against a dungeon printed AFTER the room on the page — order must not matter", async () => {
    const entities = [
      loc("room", { name: "M1. Tool Room", location_type: "room", parent_name: "Sunless Citadel" }),
      loc("dungeon", { name: "Sunless Citadel", location_type: "dungeon" }),
    ];
    const insertRow = vi.fn(async (row: Record<string, unknown>) => ({ status: "inserted" as const, id: row.name === "Sunless Citadel" ? "dungeon-id" : "room-id" }));

    await runLocationsImportKind(
      { entities, decisions: decisions([["room", CREATE], ["dungeon", CREATE]]), campaignId: CAMPAIGN_ID, provenance: PROVENANCE, existingLocations: [] },
      { insertRow },
    );

    // The dungeon must have been inserted (and its id known) before the room's
    // own insert call, regardless of the page's own listing order.
    const dungeonCallIndex = insertRow.mock.calls.findIndex((c) => (c[0] as Record<string, unknown>).name === "Sunless Citadel");
    const roomCallIndex = insertRow.mock.calls.findIndex((c) => (c[0] as Record<string, unknown>).name === "M1. Tool Room");
    expect(dungeonCallIndex).toBeLessThan(roomCallIndex);
    const roomCall = insertRow.mock.calls[roomCallIndex]![0] as Record<string, unknown>;
    expect(roomCall.parent_id).toBe("dungeon-id");
  });

  it("resolves a room's parent against an existing, already-linked dungeon (not created this batch)", async () => {
    const entities = [loc("room", { name: "M1. Tool Room", location_type: "room", parent_name: "Sunless Citadel" })];
    const existingLocations: LocationParentCandidate[] = [{ id: "existing-dungeon", name: "Sunless Citadel", locationType: "dungeon" }];
    const deps = fakeLocationDeps();

    const result = await runLocationsImportKind(
      { entities, decisions: decisions([["room", CREATE]]), campaignId: CAMPAIGN_ID, provenance: PROVENANCE, existingLocations },
      deps,
    );

    expect(deps.insertRow).toHaveBeenCalledWith(expect.objectContaining({ parent_id: "existing-dungeon", location_type: "room" }));
    expect(result.parentFallbackMessages).toEqual([]);
  });

  it("resolves a room's parent against a container the DM LINKED under a different printed name", async () => {
    // Production case: the page's container "Termalaine Gem Mine" was linked
    // to the DM's existing "Gem Mine" (a dungeon). Rooms name the page's own
    // container, which matches no existing row's name at all — only the
    // link decision itself carries that connection.
    const entities = [
      loc("mine", { name: "Termalaine Gem Mine", location_type: "dungeon" }),
      loc("room", { name: "M1. Tool Room", location_type: "room", parent_name: "Termalaine Gem Mine" }),
    ];
    const existingLocations: LocationParentCandidate[] = [{ id: "gem-mine-id", name: "Gem Mine", locationType: "dungeon" }];
    const LINK_TO_GEM_MINE: ImportDecision = {
      action: "link",
      candidate: { targetId: "gem-mine-id", source: "campaign", name: "Gem Mine", matchKind: "contains", detail: null, distance: null },
    };
    const deps = fakeLocationDeps();

    const result = await runLocationsImportKind(
      { entities, decisions: decisions([["mine", LINK_TO_GEM_MINE], ["room", CREATE]]), campaignId: CAMPAIGN_ID, provenance: PROVENANCE, existingLocations },
      deps,
    );

    expect(deps.insertRow).toHaveBeenCalledTimes(1); // only the room — the mine was linked, never inserted
    expect(deps.insertRow).toHaveBeenCalledWith(expect.objectContaining({ parent_id: "gem-mine-id", location_type: "room" }));
    expect(result.parentFallbackMessages).toEqual([]);
  });

  it("downgrades to 'other' with a message when the resolved parent can't hold rooms (e.g. a town)", async () => {
    const entities = [loc("room", { name: "The Bell Tower", location_type: "room", parent_name: "Riverwood" })];
    const existingLocations: LocationParentCandidate[] = [{ id: "town-id", name: "Riverwood", locationType: "town" }];
    const deps = fakeLocationDeps();

    const result = await runLocationsImportKind(
      { entities, decisions: decisions([["room", CREATE]]), campaignId: CAMPAIGN_ID, provenance: PROVENANCE, existingLocations },
      deps,
    );

    expect(deps.insertRow).toHaveBeenCalledWith(expect.objectContaining({ location_type: "other", parent_id: null }));
    expect(result.parentFallbackMessages).toEqual([
      'Location "The Bell Tower": no building, dungeon, store, tavern, inn or wilds to sit in on this page, so it was imported as "other".',
    ]);
  });

  it("downgrades to 'other' with a message when there's no parent_name at all", async () => {
    const entities = [loc("room", { name: "A Lonely Cell", location_type: "room" })];
    const deps = fakeLocationDeps();

    const result = await runLocationsImportKind(
      { entities, decisions: decisions([["room", CREATE]]), campaignId: CAMPAIGN_ID, provenance: PROVENANCE, existingLocations: [] },
      deps,
    );

    expect(deps.insertRow).toHaveBeenCalledWith(expect.objectContaining({ location_type: "other", parent_id: null }));
    expect(result.parentFallbackMessages).toHaveLength(1);
    expect(result.parentFallbackMessages[0]).toContain('"A Lonely Cell"');
  });

  it("still resolves a parent for a NON-interior location, unaffected by the interior guard", async () => {
    const entities = [loc("district", { name: "Dock Ward", location_type: "district", parent_name: "Waterdeep" })];
    const existingLocations: LocationParentCandidate[] = [{ id: "waterdeep-id", name: "Waterdeep", locationType: "city" }];
    const deps = fakeLocationDeps();

    const result = await runLocationsImportKind(
      { entities, decisions: decisions([["district", CREATE]]), campaignId: CAMPAIGN_ID, provenance: PROVENANCE, existingLocations },
      deps,
    );

    // A city can't "hold rooms" (not a site type), but that guard only ever
    // applies to an INTERIOR child — a district isn't one, so the link is
    // simply written, no downgrade, no message.
    expect(deps.insertRow).toHaveBeenCalledWith(expect.objectContaining({ parent_id: "waterdeep-id", location_type: "district" }));
    expect(result.parentFallbackMessages).toEqual([]);
  });

  it("stops at quota, same as the generic runner, without hanging on the reordering", async () => {
    const entities = [
      loc("a", { name: "One", location_type: "building" }),
      loc("b", { name: "Two", location_type: "building" }),
    ];
    let call = 0;
    const insertRow = vi.fn(async () => {
      call++;
      if (call === 1) return { status: "quota_exceeded" as const };
      return { status: "inserted" as const, id: "should-not-happen" };
    });

    const result = await runLocationsImportKind(
      { entities, decisions: decisions([["a", CREATE], ["b", CREATE]]), campaignId: CAMPAIGN_ID, provenance: PROVENANCE, existingLocations: [] },
      { insertRow },
    );

    expect(insertRow).toHaveBeenCalledTimes(1);
    expect(result.report.stoppedAtQuota).toBe(true);
    expect(result.report.rows).toEqual([
      { ref: "a", status: "quota_exceeded" },
      { ref: "b", status: "not_attempted" },
    ]);
  });
});
