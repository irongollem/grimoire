import { describe, expect, it, vi } from "vitest";
import { runImportKind, type RunImportKindDeps } from "./runImportKind";
import type { NameLookupRow } from "./importPlan";
import type { ExtractedEncounter, ExtractedNpc, ExtractedQuest } from "@/types/documentImport.types";
import type { AiProvenance } from "@/ai/provenance";

const CAMPAIGN_ID = "11111111-1111-1111-1111-111111111111";

const PROVENANCE: AiProvenance = {
  generatorType: "document_import",
  provider: "anthropic",
  model: "claude-test",
  generatedAt: "2026-08-24T00:00:00.000Z",
  edited: false,
};

function entity<T>(ref: string, data: T, page: number | null = 1) {
  return { ref, page, confidence: "complete" as const, data };
}

/** A deps object whose every function fails the test if called — callers
 *  override only the ones a given scenario actually exercises. */
function fakeDeps(overrides: Partial<RunImportKindDeps> = {}): RunImportKindDeps {
  return {
    insertRow: vi.fn(async () => {
      throw new Error("insertRow should not be called in this test");
    }),
    fetchNameLookup: vi.fn(async () => []),
    applyLinkResolution: vi.fn(async () => {}),
    writeQuestSpine: vi.fn(async () => {
      throw new Error("writeQuestSpine should not be called in this test");
    }),
    resolveMonsterNames: vi.fn(async () => new Map()),
    updateEncounterCombatants: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("runImportKind", () => {
  it("inserts every selected row and reports their ids", async () => {
    const entities = [entity("a", { name: "Kobold" }), entity("b", { name: "Owlbear" })];
    let call = 0;
    const insertRow = vi.fn(async () => ({ status: "inserted" as const, id: `id-${++call}` }));
    const deps = fakeDeps({ insertRow });

    const result = await runImportKind(
      { kind: "monsters", entities, selectedRefs: new Set(["a", "b"]), linkedRefs: new Set(), campaignId: CAMPAIGN_ID, provenance: PROVENANCE },
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
    expect(result.unresolvedLinkNames).toEqual([]);
  });

  it("only inserts selected, non-linked entities", async () => {
    const entities = [entity("a", { name: "Kobold" }), entity("b", { name: "Owlbear" }), entity("c", { name: "Troll" })];
    const insertRow = vi.fn(async () => ({ status: "inserted" as const, id: "new-id" }));
    const deps = fakeDeps({ insertRow });

    const result = await runImportKind(
      { kind: "monsters", entities, selectedRefs: new Set(["a", "b"]), linkedRefs: new Set(["b"]), campaignId: CAMPAIGN_ID, provenance: PROVENANCE },
      deps,
    );

    // "b" is selected but linked to an existing row, so it produces no insert.
    expect(insertRow).toHaveBeenCalledTimes(1);
    expect(result.report.planned).toBe(1);
    expect(result.insertedIds.has("b")).toBe(false);
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
      { kind: "monsters", entities, selectedRefs: new Set(["a", "b", "c"]), linkedRefs: new Set(), campaignId: CAMPAIGN_ID, provenance: PROVENANCE },
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
      { kind: "monsters", entities, selectedRefs: new Set(["a", "b"]), linkedRefs: new Set(), campaignId: CAMPAIGN_ID, provenance: PROVENANCE },
      deps,
    );

    expect(insertRow).toHaveBeenCalledTimes(2);
    expect(result.report.imported).toBe(1);
    expect(result.report.rows[0]).toEqual({ ref: "a", status: "failed", message: "boom" });
  });

  it("resolves an npc's faction_name against fetchNameLookup and applies it", async () => {
    const npc: ExtractedNpc = { name: "Reyes", faction_name: "The Watch" };
    const entities = [entity("a", npc)];
    const insertRow = vi.fn(async () => ({ status: "inserted" as const, id: "npc-1" }));
    const fetchNameLookup = vi.fn(async (): Promise<readonly NameLookupRow[]> => [{ id: "faction-1", name: "The Watch" }]);
    const applyLinkResolution = vi.fn(async (_resolution: Parameters<RunImportKindDeps["applyLinkResolution"]>[0]) => {});
    const deps = fakeDeps({ insertRow, fetchNameLookup, applyLinkResolution });

    const result = await runImportKind(
      { kind: "npcs", entities, selectedRefs: new Set(["a"]), linkedRefs: new Set(), campaignId: CAMPAIGN_ID, provenance: PROVENANCE },
      deps,
    );

    expect(fetchNameLookup).toHaveBeenCalledWith("factions");
    expect(applyLinkResolution).toHaveBeenCalledTimes(1);
    expect(applyLinkResolution.mock.calls[0]![0]).toMatchObject({
      status: "resolved",
      sourceId: "npc-1",
      field: "faction_name",
      name: "The Watch",
      targetId: "faction-1",
    });
    expect(result.unresolvedLinkNames).toEqual([]);
  });

  it("reports an unresolved link name instead of guessing", async () => {
    const npc: ExtractedNpc = { name: "Reyes", faction_name: "The Watch" };
    const entities = [entity("a", npc)];
    const insertRow = vi.fn(async () => ({ status: "inserted" as const, id: "npc-1" }));
    const applyLinkResolution = vi.fn(async () => {});
    const deps = fakeDeps({ insertRow, applyLinkResolution }); // fetchNameLookup defaults to []

    const result = await runImportKind(
      { kind: "npcs", entities, selectedRefs: new Set(["a"]), linkedRefs: new Set(), campaignId: CAMPAIGN_ID, provenance: PROVENANCE },
      deps,
    );

    expect(applyLinkResolution).not.toHaveBeenCalled();
    expect(result.unresolvedLinkNames).toEqual(["The Watch"]);
  });

  it("writes a quest's spine exactly once per inserted quest that has one", async () => {
    const withSpine: ExtractedQuest = {
      title: "The Sunken Bell",
      beats: [{ key: "b1", title: "Arrival", kind: "neutral", dm_content: "The party arrives." }],
    };
    const withoutSpine: ExtractedQuest = { title: "No beats here" };
    const entities = [entity("a", withSpine), entity("b", withoutSpine)];
    const insertRow = vi.fn(async () => ({ status: "inserted" as const, id: "quest-1" }));
    const writeQuestSpine = vi.fn(async (_input: Parameters<RunImportKindDeps["writeQuestSpine"]>[0]) => {});
    const deps = fakeDeps({ insertRow, writeQuestSpine });

    await runImportKind(
      { kind: "quests", entities, selectedRefs: new Set(["a", "b"]), linkedRefs: new Set(), campaignId: CAMPAIGN_ID, provenance: PROVENANCE },
      deps,
    );

    expect(writeQuestSpine).toHaveBeenCalledTimes(1);
    expect(writeQuestSpine.mock.calls[0]![0]).toMatchObject({ questId: "quest-1", campaignId: CAMPAIGN_ID });
  });

  it("never calls writeQuestSpine for a non-quest kind", async () => {
    const entities = [entity("a", { name: "Kobold" })];
    const insertRow = vi.fn(async () => ({ status: "inserted" as const, id: "id-1" }));
    const writeQuestSpine = vi.fn(async () => {});
    const deps = fakeDeps({ insertRow, writeQuestSpine });

    await runImportKind(
      { kind: "monsters", entities, selectedRefs: new Set(["a"]), linkedRefs: new Set(), campaignId: CAMPAIGN_ID, provenance: PROVENANCE },
      deps,
    );

    expect(writeQuestSpine).not.toHaveBeenCalled();
  });

  it("resolves an encounter's combatants against npcs and monsters, and reports the rest unresolved", async () => {
    const encounter: ExtractedEncounter = {
      name: "Ambush",
      combatants: [{ name: "Captain Reyes", count: 1 }, { name: "Kobold", count: 3 }, { name: "Nobody", count: 1 }],
    };
    const entities = [entity("a", encounter)];
    const insertRow = vi.fn(async () => ({ status: "inserted" as const, id: "encounter-1" }));
    const fetchNameLookup = vi.fn(async (kind: string): Promise<readonly NameLookupRow[]> =>
      kind === "npcs" ? [{ id: "npc-1", name: "Captain Reyes" }] : [],
    );
    const resolveMonsterNames = vi.fn(async () => new Map([["Kobold", { targetId: "monster-1" }]]));
    const updateEncounterCombatants = vi.fn(
      async (_id: string, _combatants: Parameters<RunImportKindDeps["updateEncounterCombatants"]>[1]) => {},
    );
    const deps = fakeDeps({ insertRow, fetchNameLookup, resolveMonsterNames, updateEncounterCombatants });

    const result = await runImportKind(
      { kind: "encounters", entities, selectedRefs: new Set(["a"]), linkedRefs: new Set(), campaignId: CAMPAIGN_ID, provenance: PROVENANCE },
      deps,
    );

    expect(resolveMonsterNames).toHaveBeenCalledWith(["Captain Reyes", "Kobold", "Nobody"]);
    expect(updateEncounterCombatants).toHaveBeenCalledTimes(1);
    const [, resolvedCombatants] = updateEncounterCombatants.mock.calls[0]!;
    expect(resolvedCombatants).toEqual([
      expect.objectContaining({ npc_id: "npc-1", monster_id: null, custom_name: null }),
      expect.objectContaining({ monster_id: "monster-1", npc_id: null, custom_name: null }),
      expect.objectContaining({ custom_name: "Nobody" }),
    ]);
    expect(result.unresolvedLinkNames).toEqual(["Nobody"]);
  });
});
