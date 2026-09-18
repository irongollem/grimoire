import { describe, expect, it, vi } from "vitest";
import { runImportKind, type RunImportKindDeps } from "./runImportKind";
import type { ImportDecision } from "./entityMatching";
import type { ExtractedMonster, ExtractedNpc } from "@/types/documentImport.types";
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
