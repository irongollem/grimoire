import { describe, expect, it } from "vitest";
import {
  buildImportPlan,
  buildImportRunReport,
  resolveLinkLists,
  resolveLinks,
  type ImportRowOutcome,
  type LinkedRow,
  type LinkedRowList,
  type PlannedInsert,
} from "./importPlan";
import { ENTITY_MAPPERS } from "./normalize";
import type { ImportDecision } from "./entityMatching";
import { IMPORT_ENTITY_KINDS, type ExtractedEntity, type ExtractedPayloadMap, type ImportEntityKind } from "@/types/documentImport.types";
import { getEntityKindEntry } from "./entityKinds";
import type { AiProvenance } from "@/ai/provenance";

const CREATE: ImportDecision = { action: "create" };
const IGNORE: ImportDecision = { action: "ignore" };

function decisions(entries: readonly [string, ImportDecision][]): ReadonlyMap<string, ImportDecision> {
  return new Map(entries);
}

const CAMPAIGN_ID = "11111111-1111-1111-1111-111111111111";

const PROVENANCE: AiProvenance = {
  generatorType: "document_import",
  provider: "anthropic",
  model: "claude-test",
  generatedAt: "2026-08-24T00:00:00.000Z",
  edited: false,
};

// One minimal payload per kind — enough for the mapper to run, nothing more.
const SAMPLE_ENTITY_DATA: { [K in ImportEntityKind]: ExtractedPayloadMap[K] } = {
  monsters: { name: "Test Monster" },
  npcs: { name: "Test NPC" },
  locations: { name: "Test Location" },
  items: { name: "Test Item" },
  spells: { name: "Test Spell" },
  quests: { title: "Test Quest" },
  factions: { name: "Test Faction" },
  encounters: { name: "Test Encounter" },
};

function entity<K extends ImportEntityKind>(
  ref: string,
  data: ExtractedPayloadMap[K],
  page: number | null = 1,
): ExtractedEntity<K> {
  return { ref, page, confidence: "complete", data };
}

// `ENTITY_MAPPERS[kind]` indexed by a loop variable hits the same
// correlated-record limitation `importPlan.ts` documents on `mapEntity` — the
// compiler can't tie a runtime `kind` back to the specific mapper's parameter
// type. `unknown` + a narrow local type describes exactly what every mapper
// actually is (not `any`, which would also hide a real type error here).
type AnyEntityMapper = (data: unknown, campaignId: string, provenance: AiProvenance) => { row: unknown; links: unknown };

describe("buildImportPlan", () => {
  it("dispatches to the correct ENTITY_MAPPERS entry for every kind", () => {
    for (const kind of IMPORT_ENTITY_KINDS) {
      const data = SAMPLE_ENTITY_DATA[kind];
      const [planned] = buildImportPlan(kind, [entity(kind, data)], decisions([[kind, CREATE]]), CAMPAIGN_ID, PROVENANCE);
      const mapper = ENTITY_MAPPERS[kind] as unknown as AnyEntityMapper;
      const direct = mapper(data, CAMPAIGN_ID, PROVENANCE);

      expect(planned).toBeDefined();
      expect(planned.row).toEqual(direct.row);
      expect(planned.links).toEqual(direct.links);

      const displayField = getEntityKindEntry(kind).displayField;
      expect((planned.row as Record<string, unknown>)[displayField]).toBe(
        (data as unknown as Record<string, unknown>)[displayField],
      );
    }
  });

  it("includes only the entities decided 'create'", () => {
    const entities = [
      entity<"npcs">("r1", { name: "Alice" }),
      entity<"npcs">("r2", { name: "Bob" }),
      entity<"npcs">("r3", { name: "Cara" }),
    ];
    const plan = buildImportPlan(
      "npcs",
      entities,
      decisions([["r1", CREATE], ["r2", IGNORE], ["r3", CREATE]]),
      CAMPAIGN_ID,
      PROVENANCE,
    );
    expect(plan.map((p) => p.ref)).toEqual(["r1", "r3"]);
  });

  it("orders the plan by the entities list, not by the decisions map's iteration order", () => {
    const entities = [
      entity<"npcs">("r1", { name: "Alice" }),
      entity<"npcs">("r2", { name: "Bob" }),
      entity<"npcs">("r3", { name: "Cara" }),
    ];
    // A Map built in the opposite order — insertion order is r3, r1, r2.
    const decided = decisions([["r3", CREATE], ["r1", CREATE], ["r2", CREATE]]);
    const plan = buildImportPlan("npcs", entities, decided, CAMPAIGN_ID, PROVENANCE);
    expect(plan.map((p) => p.ref)).toEqual(["r1", "r2", "r3"]);
  });

  it("is deterministic across repeated calls with the same inputs", () => {
    const entities = [
      entity<"monsters">("m1", { name: "Owlbear" }),
      entity<"monsters">("m2", { name: "Beholder" }),
      entity<"monsters">("m3", { name: "Displacer Beast" }),
    ];
    const decided = decisions([["m3", CREATE], ["m2", CREATE], ["m1", CREATE]]);
    const first = buildImportPlan("monsters", entities, decided, CAMPAIGN_ID, PROVENANCE);
    const second = buildImportPlan("monsters", entities, decided, CAMPAIGN_ID, PROVENANCE);
    expect(first.map((p) => p.ref)).toEqual(second.map((p) => p.ref));
    expect(first.map((p) => p.ref)).toEqual(["m1", "m2", "m3"]);
  });

  it("carries raw-name links through unresolved, for npcs → faction", () => {
    const entities = [entity<"npcs">("r1", { name: "Renn", faction_name: "The Zhentarim" })];
    const [planned] = buildImportPlan("npcs", entities, decisions([["r1", CREATE]]), CAMPAIGN_ID, PROVENANCE);
    expect(planned.links).toEqual({ faction_name: "The Zhentarim" });
  });

  it("produces an empty plan when no entity is decided", () => {
    const entities = [entity<"items">("i1", { name: "Sword" })];
    expect(buildImportPlan("items", entities, decisions([]), CAMPAIGN_ID, PROVENANCE)).toEqual([]);
  });

  it("excludes an entity decided 'link' from the plan (#837/#838)", () => {
    const entities = [
      entity<"monsters">("m1", { name: "Kobold" }),
      entity<"monsters">("m2", { name: "Owlbear" }),
    ];
    const plan = buildImportPlan(
      "monsters",
      entities,
      decisions([
        ["m1", { action: "link", candidate: { targetId: "mon-1", source: "campaign", name: "Kobold", matchKind: "exact", detail: null, distance: null } }],
        ["m2", CREATE],
      ]),
      CAMPAIGN_ID,
      PROVENANCE,
    );
    expect(plan.map((p) => p.ref)).toEqual(["m2"]);
  });

  it("excludes an entity decided 'generate' from the plan — that goes through the AI generator, not an insert", () => {
    const entities = [entity<"monsters">("m1", { name: "Grell" })];
    const plan = buildImportPlan("monsters", entities, decisions([["m1", { action: "generate" }]]), CAMPAIGN_ID, PROVENANCE);
    expect(plan).toEqual([]);
  });

  it("treats an entity absent from the decisions map as not planned — absence is not consent", () => {
    const entities = [entity<"items">("i1", { name: "Potion of Healing" })];
    const plan = buildImportPlan("items", entities, decisions([]), CAMPAIGN_ID, PROVENANCE);
    expect(plan).toEqual([]);
  });
});

describe("buildImportRunReport", () => {
  const plan: Pick<PlannedInsert, "ref">[] = [
    { ref: "r1" },
    { ref: "r2" },
    { ref: "r3" },
    { ref: "r4" },
    { ref: "r5" },
  ];

  it("expresses a mid-batch quota stop as N of M imported", () => {
    const outcomes: ImportRowOutcome[] = [
      { ref: "r1", status: "inserted", id: "id-1" },
      { ref: "r2", status: "inserted", id: "id-2" },
      { ref: "r3", status: "inserted", id: "id-3" },
      { ref: "r4", status: "quota_exceeded" },
      // r5 never attempted — the composable stops after the quota refusal.
    ];
    const report = buildImportRunReport("monsters", plan, outcomes);

    expect(report.planned).toBe(5);
    expect(report.imported).toBe(3);
    expect(report.stoppedAtQuota).toBe(true);
    expect(report.rows).toEqual([
      { ref: "r1", status: "inserted", id: "id-1" },
      { ref: "r2", status: "inserted", id: "id-2" },
      { ref: "r3", status: "inserted", id: "id-3" },
      { ref: "r4", status: "quota_exceeded" },
      { ref: "r5", status: "not_attempted" },
    ]);
  });

  it("reports full success with no quota stop when every row lands", () => {
    const outcomes: ImportRowOutcome[] = plan.map((p, i) => ({
      ref: p.ref,
      status: "inserted" as const,
      id: `id-${i}`,
    }));
    const report = buildImportRunReport("factions", plan, outcomes);

    expect(report.planned).toBe(5);
    expect(report.imported).toBe(5);
    expect(report.stoppedAtQuota).toBe(false);
    expect(report.rows.every((r) => r.status === "inserted")).toBe(true);
  });

  it("accounts for a non-quota failure without marking the run quota-stopped", () => {
    const outcomes: ImportRowOutcome[] = [
      { ref: "r1", status: "inserted", id: "id-1" },
      { ref: "r2", status: "failed", message: "duplicate name" },
    ];
    const report = buildImportRunReport("items", plan, outcomes);

    expect(report.imported).toBe(1);
    expect(report.stoppedAtQuota).toBe(false);
    expect(report.rows[1]).toEqual({ ref: "r2", status: "failed", message: "duplicate name" });
    // r3–r5 are still "not_attempted" here since the composable chose to stop,
    // not because this module inferred anything about non-quota failures.
    expect(report.rows.slice(2)).toEqual([
      { ref: "r3", status: "not_attempted" },
      { ref: "r4", status: "not_attempted" },
      { ref: "r5", status: "not_attempted" },
    ]);
  });

  it("handles an empty plan", () => {
    const report = buildImportRunReport("spells", [], []);
    expect(report).toEqual({ kind: "spells", planned: 0, imported: 0, stoppedAtQuota: false, rows: [] });
  });
});

describe("resolveLinks", () => {
  it("matches names case-insensitively", () => {
    const rows: LinkedRow[] = [{ id: "npc-1", links: { faction_name: "the zhentarim" } }];
    const result = resolveLinks("npcs", rows, { factions: [{ id: "f1", name: "The Zhentarim" }] });

    expect(result).toEqual([
      {
        status: "resolved",
        sourceId: "npc-1",
        field: "faction_name",
        name: "the zhentarim",
        targetId: "f1",
        apply: { kind: "join_insert", table: "faction_npcs", sourceColumn: "npc_id", targetColumn: "faction_id" },
      },
    ]);
  });

  it("reports an unresolved name rather than throwing or inventing an id", () => {
    const rows: LinkedRow[] = [{ id: "npc-1", links: { faction_name: "The Harpers" } }];
    const result = resolveLinks("npcs", rows, { factions: [{ id: "f1", name: "The Zhentarim" }] });

    expect(result).toEqual([{ status: "unresolved", sourceId: "npc-1", field: "faction_name", name: "The Harpers" }]);
  });

  it("does not throw when the lookup for the target kind is absent entirely", () => {
    const rows: LinkedRow[] = [{ id: "npc-1", links: { faction_name: "The Harpers" } }];
    expect(() => resolveLinks("npcs", rows, {})).not.toThrow();
    expect(resolveLinks("npcs", rows, {})).toEqual([
      { status: "unresolved", sourceId: "npc-1", field: "faction_name", name: "The Harpers" },
    ]);
  });

  // A location's own `parent_name` is deliberately absent from this file's
  // machinery — resolved at insert time instead (`runLocationsImportKind.test.ts`
  // covers it), because `guard_location_room_parent` checks it on the very
  // insert that creates an interior row, long before this second pass runs.
  // See importPlan.ts's own `LINK_TARGETS` comment.

  it("resolves both quest links independently on the same row", () => {
    const rows: LinkedRow[] = [
      { id: "quest-1", links: { giver_npc_name: "Renn", location_name: "Waterdeep" } },
    ];
    const result = resolveLinks("quests", rows, {
      npcs: [{ id: "npc-1", name: "Renn" }],
      locations: [{ id: "loc-1", name: "Waterdeep" }],
    });

    expect(result).toHaveLength(2);
    expect(result).toContainEqual({
      status: "resolved",
      sourceId: "quest-1",
      field: "giver_npc_name",
      name: "Renn",
      targetId: "npc-1",
      apply: { kind: "fk_update", table: "quests", column: "giver_npc_id" },
    });
    expect(result).toContainEqual({
      status: "resolved",
      sourceId: "quest-1",
      field: "location_name",
      name: "Waterdeep",
      targetId: "loc-1",
      apply: { kind: "fk_update", table: "quests", column: "location_id" },
    });
  });

  it("resolves an encounter's room against locations, on its own FK column (#840)", () => {
    // Named `encounter_location_name` rather than reusing quests' own
    // `location_name` — LINK_TARGETS has one fixed apply target per field,
    // and an encounter's room updates a different column (encounters.location_id).
    const rows: LinkedRow[] = [{ id: "enc-1", links: { encounter_location_name: "M3. River Cavern" } }];
    const result = resolveLinks("encounters", rows, {
      locations: [{ id: "loc-1", name: "M3. River Cavern" }],
    });

    expect(result).toEqual([
      {
        status: "resolved",
        sourceId: "enc-1",
        field: "encounter_location_name",
        name: "M3. River Cavern",
        targetId: "loc-1",
        apply: { kind: "fk_update", table: "encounters", column: "location_id" },
      },
    ]);
  });

  it("skips a link field that was never captured for a row", () => {
    const rows: LinkedRow[] = [{ id: "quest-1", links: { giver_npc_name: "Renn" } }];
    const result = resolveLinks("quests", rows, { npcs: [{ id: "npc-1", name: "Renn" }] });
    expect(result).toHaveLength(1);
    expect(result[0]?.field).toBe("giver_npc_name");
  });

  it("returns an empty array for a kind with no link fields at all", () => {
    const rows: LinkedRow[] = [{ id: "monster-1", links: {} }];
    expect(resolveLinks("monsters", rows, {})).toEqual([]);
  });

  it("returns an empty array when there are no rows", () => {
    expect(resolveLinks("npcs", [], { factions: [{ id: "f1", name: "The Zhentarim" }] })).toEqual([]);
  });

  it("resolves an npc's usual location, even though locations extract after npcs", () => {
    // The whole reason this link exists as a scalar EntityLinks field at all
    // (rather than being unresolvable): the sweep's linking phase runs after
    // every kind has imported, so it doesn't matter that `locations` comes
    // after `npcs` in IMPORT_ENTITY_KINDS.
    const rows: LinkedRow[] = [{ id: "npc-1", links: { npc_location_name: "The Rusty Anchor" } }];
    const result = resolveLinks("npcs", rows, { locations: [{ id: "loc-1", name: "The Rusty Anchor" }] });

    expect(result).toEqual([
      {
        status: "resolved",
        sourceId: "npc-1",
        field: "npc_location_name",
        name: "The Rusty Anchor",
        targetId: "loc-1",
        apply: { kind: "fk_update", table: "npcs", column: "location_id" },
      },
    ]);
  });

  it("resolves a location's owner npc", () => {
    const rows: LinkedRow[] = [{ id: "loc-1", links: { owner_npc_name: "Old Gaffer" } }];
    const result = resolveLinks("locations", rows, { npcs: [{ id: "npc-1", name: "Old Gaffer" }] });

    expect(result).toEqual([
      {
        status: "resolved",
        sourceId: "loc-1",
        field: "owner_npc_name",
        name: "Old Gaffer",
        targetId: "npc-1",
        apply: { kind: "fk_update", table: "locations", column: "npc_owner_id" },
      },
    ]);
  });
});

describe("resolveLinkLists", () => {
  it("resolves each name in a faction's location_names to its own join_insert", () => {
    const rows: LinkedRowList[] = [{ id: "faction-1", linkLists: { location_names: ["Dock Ward", "The Thieves' Den"] } }];
    const result = resolveLinkLists("factions", rows, {
      locations: [{ id: "loc-1", name: "Dock Ward" }, { id: "loc-2", name: "The Thieves' Den" }],
    });

    expect(result).toEqual([
      {
        status: "resolved",
        sourceId: "faction-1",
        field: "location_names",
        name: "Dock Ward",
        targetId: "loc-1",
        apply: { kind: "join_insert", table: "faction_locations", sourceColumn: "faction_id", targetColumn: "location_id" },
      },
      {
        status: "resolved",
        sourceId: "faction-1",
        field: "location_names",
        name: "The Thieves' Den",
        targetId: "loc-2",
        apply: { kind: "join_insert", table: "faction_locations", sourceColumn: "faction_id", targetColumn: "location_id" },
      },
    ]);
  });

  it("reports one unresolved name per miss, without dropping the rest of the list", () => {
    const rows: LinkedRowList[] = [{ id: "faction-1", linkLists: { location_names: ["Dock Ward", "Nowhere"] } }];
    const result = resolveLinkLists("factions", rows, { locations: [{ id: "loc-1", name: "Dock Ward" }] });

    expect(result).toContainEqual({ status: "resolved", sourceId: "faction-1", field: "location_names", name: "Dock Ward", targetId: "loc-1", apply: expect.anything() });
    expect(result).toContainEqual({ status: "unresolved", sourceId: "faction-1", field: "location_names", name: "Nowhere" });
  });

  it("skips a row with no location_names captured", () => {
    const rows: LinkedRowList[] = [{ id: "faction-1", linkLists: {} }];
    expect(resolveLinkLists("factions", rows, {})).toEqual([]);
  });

  it("returns an empty array for a kind with no link-list fields at all", () => {
    expect(resolveLinkLists("npcs", [{ id: "npc-1", linkLists: {} }], {})).toEqual([]);
  });
});
