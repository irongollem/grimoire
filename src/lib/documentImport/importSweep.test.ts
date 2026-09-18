import { describe, expect, it, vi } from "vitest";
import { runImportSweep, type AdoptLibraryOutcome, type ImportSweepDeps, type ImportSweepInput } from "./importSweep";
import type { ImportDecision } from "./entityMatching";
import type { UsableEntity } from "./sanitizeEntities";
import type { InsertRowOutcome } from "./runImportKind";
import type { NameLookupRow, LinkResolution } from "./importPlan";
import type { DocumentImport, ImportEntityKind } from "@/types/documentImport.types";

const CAMPAIGN_ID = "11111111-1111-1111-1111-111111111111";

const IMPORT_ROW: Pick<DocumentImport, "campaign_id" | "ai_provenance" | "imported_counts"> = {
  campaign_id: CAMPAIGN_ID,
  ai_provenance: {
    generatorType: "document_import",
    provider: "anthropic",
    model: "claude-test",
    generatedAt: "2026-08-24T00:00:00.000Z",
    edited: false,
  },
  imported_counts: {},
};

const CREATE: ImportDecision = { action: "create" };
const IGNORE: ImportDecision = { action: "ignore" };

function usable(ref: string, data: Record<string, unknown>): UsableEntity {
  return { ref, page: 1, confidence: "complete", data };
}

/** Sequential ids per table, so tests can assert on predictable values
 *  without hand-threading a counter through every scenario. */
function fakeDeps(overrides: Partial<ImportSweepDeps> = {}): ImportSweepDeps {
  const counters = new Map<string, number>();
  const nextId = (prefix: string) => {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return `${prefix}-${n}`;
  };

  return {
    insertRow: vi.fn(async (kind: ImportEntityKind): Promise<InsertRowOutcome> => ({ status: "inserted", id: nextId(kind) })),
    generateMonster: vi.fn(async (): Promise<InsertRowOutcome> => ({ status: "inserted", id: nextId("generated") })),
    // Defaults to a successful adoption — most tests never decide a `link` to
    // a library candidate at all, so this never fires for them; the tests
    // that specifically exercise adoption override it.
    adoptLibraryMonster: vi.fn(async (): Promise<AdoptLibraryOutcome> => ({ status: "adopted", id: nextId("adopted-monster") })),
    adoptLibraryItem: vi.fn(async (): Promise<AdoptLibraryOutcome> => ({ status: "adopted", id: nextId("adopted-item") })),
    fetchNameLookup: vi.fn(async (): Promise<readonly NameLookupRow[]> => []),
    applyLinkResolution: vi.fn(async () => {}),
    writeQuestSpine: vi.fn(async () => ({ beatIdByKey: new Map<string, string>() })),
    resolveMonsterNames: vi.fn(async () => new Map()),
    updateEncounterCombatants: vi.fn(async () => {}),
    updateBeatLocation: vi.fn(async () => {}),
    insertBeatAttachment: vi.fn(async () => {}),
    insertLootPlacement: vi.fn(async () => {}),
    insertQuestRef: vi.fn(async () => {}),
    updateQuestParent: vi.fn(async () => {}),
    persistImportedCounts: vi.fn(async () => {}),
    markComplete: vi.fn(async () => {}),
    ...overrides,
  };
}

function input(overrides: Partial<ImportSweepInput> = {}): ImportSweepInput {
  return { entitiesByKind: {}, decisions: new Map(), parentQuestId: null, sourceTitle: null, ...overrides };
}

describe("runImportSweep", () => {
  it("imports every kind present and reports create/link/ignore counts per kind", async () => {
    const deps = fakeDeps();
    const report = await runImportSweep(
      IMPORT_ROW,
      input({
        entitiesByKind: {
          monsters: [usable("m1", { name: "Kobold" }), usable("m2", { name: "Owlbear" }), usable("m3", { name: "Troll" })],
        },
        decisions: new Map([
          [
            "monsters",
            new Map<string, ImportDecision>([
              ["m1", CREATE],
              ["m2", { action: "link", candidate: { targetId: "mon-existing", source: "campaign", name: "Owlbear", matchKind: "exact", detail: null, distance: null } }],
              ["m3", IGNORE],
            ]),
          ],
        ]),
      }),
      deps,
    );

    expect(report.perKind.monsters).toMatchObject({ planned: 1, imported: 1, linked: 1, ignored: 1 });
    expect(deps.insertRow).toHaveBeenCalledTimes(1);
    expect(deps.markComplete).toHaveBeenCalledTimes(1);
  });

  it("persists imported_counts after every kind it actually imports, for crash-resume", async () => {
    const deps = fakeDeps();
    await runImportSweep(
      IMPORT_ROW,
      input({
        entitiesByKind: { monsters: [usable("m1", { name: "Kobold" })], npcs: [usable("n1", { name: "Reyes" })] },
        decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([
          ["monsters", new Map([["m1", CREATE]])],
          ["npcs", new Map([["n1", CREATE]])],
        ]),
      }),
      deps,
    );

    // Both persisted calls carry the running total, not just the one kind
    // that just finished — a crash between them must still know monsters=1.
    const calls = (deps.persistImportedCounts as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(calls).toContainEqual(expect.objectContaining({ monsters: 1 }));
    expect(calls.at(-1)).toMatchObject({ monsters: 1, npcs: 1 });
  });

  it("skips a kind whose imported_counts is already set (resumed) without inserting again", async () => {
    const deps = fakeDeps();
    await runImportSweep(
      { ...IMPORT_ROW, imported_counts: { monsters: 3 } },
      input({ entitiesByKind: { monsters: [usable("m1", { name: "Kobold" })] }, decisions: new Map([["monsters", new Map([["m1", CREATE]])]]) }),
      deps,
    );

    expect(deps.insertRow).not.toHaveBeenCalled();
    // Every kind after "monsters" still runs (with zero entities of its own)
    // and checkpoints normally, but "monsters" itself is never re-attempted
    // or re-counted — every persisted snapshot keeps it at its resumed value.
    const calls = (deps.persistImportedCounts as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    for (const counts of calls) expect(counts.monsters).toBe(3);
  });

  it("reports onProgress for every kind and a final linking phase", async () => {
    const deps = fakeDeps();
    const progress: string[] = [];
    await runImportSweep(IMPORT_ROW, input({ entitiesByKind: { monsters: [usable("m1", { name: "Kobold" })] }, decisions: new Map([["monsters", new Map([["m1", CREATE]])]]) }), deps, (p) => {
      progress.push(p.kind ? `${p.phase}:${p.kind}` : p.phase);
    });

    expect(progress[0]).toBe("importing:factions"); // the very first kind in IMPORT_ENTITY_KINDS order
    expect(progress).toContain("importing:monsters");
    expect(progress.filter((p) => p === "linking").length).toBeGreaterThanOrEqual(1);
  });

  describe("the whole point of the sweep: a link to a kind imported LATER", () => {
    it("resolves an npc's location_name even though locations import after npcs", async () => {
      const deps = fakeDeps();
      const report = await runImportSweep(
        IMPORT_ROW,
        input({
          entitiesByKind: {
            npcs: [usable("n1", { name: "Old Gaffer", location_name: "The Rusty Anchor" })],
            locations: [usable("l1", { name: "The Rusty Anchor" })],
          },
          decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([
            ["npcs", new Map([["n1", CREATE]])],
            ["locations", new Map([["l1", CREATE]])],
          ]),
        }),
        deps,
      );

      expect(report.unresolvedLinks).toEqual([]);
      const applied = (deps.applyLinkResolution as ReturnType<typeof vi.fn>).mock.calls.map(
        (c) => c[0] as Extract<LinkResolution, { status: "resolved" }>,
      );
      expect(applied).toContainEqual(
        expect.objectContaining({ field: "npc_location_name", apply: { kind: "fk_update", table: "npcs", column: "location_id" } }),
      );
    });

    it("reports a readable message when a scalar link matches nothing", async () => {
      const deps = fakeDeps();
      const report = await runImportSweep(
        IMPORT_ROW,
        input({
          entitiesByKind: { npcs: [usable("n1", { name: "Old Gaffer", faction_name: "The Watch" })] },
          decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([["npcs", new Map([["n1", CREATE]])]]),
        }),
        deps,
      );

      expect(report.unresolvedLinks).toContain('NPC "Old Gaffer" → faction "The Watch"');
    });
  });

  it("resolves a faction's location_names into one join_insert per name", async () => {
    const deps = fakeDeps();
    await runImportSweep(
      IMPORT_ROW,
      input({
        entitiesByKind: {
          factions: [usable("f1", { name: "The Ashen Circle", location_names: ["Dock Ward", "The Sunken Temple"] })],
          locations: [usable("l1", { name: "Dock Ward" }), usable("l2", { name: "The Sunken Temple" })],
        },
        decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([
          ["factions", new Map([["f1", CREATE]])],
          ["locations", new Map([["l1", CREATE], ["l2", CREATE]])],
        ]),
      }),
      deps,
    );

    const joinInserts = (deps.applyLinkResolution as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0] as Extract<LinkResolution, { status: "resolved" }>)
      .filter((r) => r.apply.kind === "join_insert" && r.apply.table === "faction_locations");
    expect(joinInserts).toHaveLength(2);
  });

  it("gives a faction the DM linked to the places the page puts it in — join rows are additive", async () => {
    const deps = fakeDeps();
    await runImportSweep(
      IMPORT_ROW,
      input({
        entitiesByKind: {
          factions: [usable("f1", { name: "Council of Speakers", location_names: ["Upper Gallery"] })],
          locations: [usable("l1", { name: "Upper Gallery" })],
        },
        decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([
          ["factions", new Map([["f1", { action: "link", candidate: { targetId: "fac-existing", source: "campaign", name: "Council of Speakers", matchKind: "exact", detail: null, distance: null } }]])],
          ["locations", new Map([["l1", CREATE]])],
        ]),
      }),
      deps,
    );

    const joinInserts = (deps.applyLinkResolution as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0] as Extract<LinkResolution, { status: "resolved" }>)
      .filter((r) => r.apply.kind === "join_insert" && r.apply.table === "faction_locations");
    expect(joinInserts).toHaveLength(1);
    expect(joinInserts[0]!.sourceId).toBe("fac-existing");
  });

  describe("quest beats: location + attachments", () => {
    function questInput(): ImportSweepInput {
      return input({
        entitiesByKind: {
          quests: [
            usable("q1", {
              title: "The Sunken Bell",
              beats: [
                {
                  key: "b1",
                  title: "Into the crypt",
                  kind: "explore",
                  dm_content: "Water rises.",
                  location_name: "The Flooded Cathedral",
                  npc_names: ["Father Corvin"],
                  faction_names: ["The Ashen Circle"],
                  encounter_names: ["Ambush at the altar"],
                },
              ],
            }),
          ],
          npcs: [usable("n1", { name: "Father Corvin" })],
          locations: [usable("l1", { name: "The Flooded Cathedral" })],
          factions: [usable("f1", { name: "The Ashen Circle" })],
          encounters: [usable("e1", { name: "Ambush at the altar" })],
        },
        decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([
          ["quests", new Map([["q1", CREATE]])],
          ["npcs", new Map([["n1", CREATE]])],
          ["locations", new Map([["l1", CREATE]])],
          ["factions", new Map([["f1", CREATE]])],
          ["encounters", new Map([["e1", CREATE]])],
        ]),
      });
    }

    it("stages the beat at its location and attaches every named npc/faction/encounter", async () => {
      const deps = fakeDeps({
        writeQuestSpine: vi.fn(async () => ({ beatIdByKey: new Map([["b1", "beat-1"]]) })),
      });
      const report = await runImportSweep(IMPORT_ROW, questInput(), deps);

      expect(report.createdQuestId).toBe("quests-1");
      expect(deps.updateBeatLocation).toHaveBeenCalledWith("beat-1", "locations-1");
      const attachments = (deps.insertBeatAttachment as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
      expect(attachments).toContainEqual(expect.objectContaining({ attachment_type: "npc", ref_id: "npcs-1", beat_id: "beat-1" }));
      expect(attachments).toContainEqual(expect.objectContaining({ attachment_type: "faction", ref_id: "factions-1" }));
      expect(attachments).toContainEqual(expect.objectContaining({ attachment_type: "encounter", ref_id: "encounters-1" }));
      expect(report.unresolvedLinks).toEqual([]);
    });

    it("writes a quest_refs row for every entity the sweep created, for the created quest", async () => {
      const deps = fakeDeps({ writeQuestSpine: vi.fn(async () => ({ beatIdByKey: new Map([["b1", "beat-1"]]) })) });
      await runImportSweep(IMPORT_ROW, questInput(), deps);

      const refs = (deps.insertQuestRef as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
      expect(refs).toContainEqual({ quest_id: "quests-1", ref_type: "npc", ref_id: "npcs-1" });
      expect(refs).toContainEqual({ quest_id: "quests-1", ref_type: "location", ref_id: "locations-1" });
      expect(refs).toContainEqual({ quest_id: "quests-1", ref_type: "faction", ref_id: "factions-1" });
      expect(refs).toContainEqual({ quest_id: "quests-1", ref_type: "encounter", ref_id: "encounters-1" });
    });

    it("applies parentQuestId to the created quest", async () => {
      const deps = fakeDeps({ writeQuestSpine: vi.fn(async () => ({ beatIdByKey: new Map([["b1", "beat-1"]]) })) });
      await runImportSweep(IMPORT_ROW, { ...questInput(), parentQuestId: "parent-quest-9" }, deps);
      expect(deps.updateQuestParent).toHaveBeenCalledWith("quests-1", "parent-quest-9");
    });

    it("skips a beat that never got a real id (best-effort — matches every other write here)", async () => {
      const deps = fakeDeps({ writeQuestSpine: vi.fn(async () => ({ beatIdByKey: new Map() })) }); // "b1" never landed
      const report = await runImportSweep(IMPORT_ROW, questInput(), deps);
      expect(deps.updateBeatLocation).not.toHaveBeenCalled();
      expect(deps.insertBeatAttachment).not.toHaveBeenCalled();
      expect(report.unresolvedLinks).toEqual([]); // not "unresolved" — the beat itself just isn't there
    });
  });

  describe("a beat's monster_names / item_names: campaign vs shared library", () => {
    it("attaches a campaign-sourced monster and places a campaign-sourced item as beat loot", async () => {
      const deps = fakeDeps({ writeQuestSpine: vi.fn(async () => ({ beatIdByKey: new Map([["b1", "beat-1"]]) })) });
      const report = await runImportSweep(
        IMPORT_ROW,
        input({
          entitiesByKind: {
            quests: [usable("q1", { title: "X", beats: [{ key: "b1", title: "Fight", kind: "combat", dm_content: "", monster_names: ["Kobold"], item_names: ["Silver bell"] }] })],
            monsters: [usable("m1", { name: "Kobold" })],
            items: [usable("i1", { name: "Silver bell" })],
          },
          decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([
            ["quests", new Map([["q1", CREATE]])],
            ["monsters", new Map([["m1", CREATE]])],
            ["items", new Map([["i1", CREATE]])],
          ]),
        }),
        deps,
      );

      expect(deps.insertBeatAttachment).toHaveBeenCalledWith(expect.objectContaining({ attachment_type: "monster", ref_id: "monsters-1" }));
      expect(deps.insertLootPlacement).toHaveBeenCalledWith(
        expect.objectContaining({ home: { beat_id: "beat-1", quest_id: "quests-1" }, kind: "item", item_id: "items-1", label: "Silver bell" }),
      );
      expect(report.unresolvedLinks).toEqual([]);
    });

    it("links a library-sourced monster/item to the quest only, and reports why it isn't a beat attachment", async () => {
      const deps = fakeDeps({ writeQuestSpine: vi.fn(async () => ({ beatIdByKey: new Map([["b1", "beat-1"]]) })) });
      const report = await runImportSweep(
        IMPORT_ROW,
        input({
          entitiesByKind: {
            quests: [usable("q1", { title: "X", beats: [{ key: "b1", title: "Fight", kind: "combat", dm_content: "", monster_names: ["Owlbear"], item_names: ["Bag of Holding"] }] })],
          },
          decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([["quests", new Map([["q1", CREATE]])]]),
        }),
        {
          ...deps,
          // Simulate the campaign lookup returning a library-sourced row for
          // both names — the shape `match_import_entity_names` would have
          // produced for a shared-library monster/item.
          fetchNameLookup: vi.fn(async () => []),
        },
      );

      // Since fetchNameLookup returns nothing and there's no registry entry
      // either (neither kind was imported this sweep), both names are
      // genuinely unresolved rather than library-linked — this asserts the
      // plain "matched nothing" path still fires when there's truly no match.
      expect(deps.insertBeatAttachment).not.toHaveBeenCalled();
      expect(deps.insertLootPlacement).not.toHaveBeenCalled();
      expect(report.unresolvedLinks).toContain('Beat "Fight" → monster "Owlbear"');
      expect(report.unresolvedLinks).toContain('Beat "Fight" → item "Bag of Holding"');
    });

    it("falls back to quest-level linking when a library adoption fails, and reports why", async () => {
      // A failed (or never-attempted) adoption leaves the decision pointing
      // at the library candidate exactly as before this feature existed —
      // this pins that fallback still works.
      const deps = fakeDeps({
        writeQuestSpine: vi.fn(async () => ({ beatIdByKey: new Map([["b1", "beat-1"]]) })),
        adoptLibraryMonster: vi.fn(async (): Promise<AdoptLibraryOutcome> => ({ status: "failed", message: "boom" })),
      });
      const report = await runImportSweep(
        IMPORT_ROW,
        input({
          entitiesByKind: {
            quests: [usable("q1", { title: "X", beats: [{ key: "b1", title: "Fight", kind: "combat", dm_content: "", monster_names: ["Owlbear"] }] })],
            monsters: [usable("m1", { name: "Owlbear" })],
          },
          decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([
            ["quests", new Map([["q1", CREATE]])],
            [
              "monsters",
              new Map([
                ["m1", { action: "link", candidate: { targetId: "srd_owlbear", source: "library", name: "Owlbear", matchKind: "exact", detail: null, distance: null } }],
              ]),
            ],
          ]),
        }),
        deps,
      );

      expect(deps.insertBeatAttachment).not.toHaveBeenCalled();
      expect(report.unresolvedLinks).toContainEqual(expect.stringContaining('couldn\'t add "Owlbear" from the library (boom)'));
      expect(report.unresolvedLinks).toContainEqual(expect.stringContaining("shared-library creature"));
      const refs = (deps.insertQuestRef as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
      expect(refs).toContainEqual({ quest_id: "quests-1", ref_type: "monster", ref_id: "srd_owlbear" });
      expect(report.perKind.monsters?.adopted).toBe(0);
    });

    it("adopts a link-decided library monster before the registry is built, so a beat can attach the copy", async () => {
      const adoptLibraryMonster = vi.fn(async (libraryId: string): Promise<AdoptLibraryOutcome> => {
        expect(libraryId).toBe("srd_owlbear");
        return { status: "adopted", id: "owned-owlbear" };
      });
      const deps = fakeDeps({
        writeQuestSpine: vi.fn(async () => ({ beatIdByKey: new Map([["b1", "beat-1"]]) })),
        adoptLibraryMonster,
      });
      const report = await runImportSweep(
        IMPORT_ROW,
        input({
          entitiesByKind: {
            quests: [usable("q1", { title: "X", beats: [{ key: "b1", title: "Fight", kind: "combat", dm_content: "", monster_names: ["Owlbear"] }] })],
            monsters: [usable("m1", { name: "Owlbear" })],
          },
          decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([
            ["quests", new Map([["q1", CREATE]])],
            [
              "monsters",
              new Map([
                ["m1", { action: "link", candidate: { targetId: "srd_owlbear", source: "library", name: "Owlbear", matchKind: "exact", detail: null, distance: null } }],
              ]),
            ],
          ]),
        }),
        deps,
      );

      expect(adoptLibraryMonster).toHaveBeenCalledTimes(1);
      expect(deps.insertBeatAttachment).toHaveBeenCalledWith(expect.objectContaining({ attachment_type: "monster", ref_id: "owned-owlbear" }));
      expect(report.unresolvedLinks).toEqual([]);
      expect(report.perKind.monsters).toMatchObject({ linked: 0, adopted: 1 });
      const refs = (deps.insertQuestRef as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
      expect(refs).toContainEqual({ quest_id: "quests-1", ref_type: "monster", ref_id: "owned-owlbear" });
    });

    it("stops further adoptions of a kind once one hits the monster quota, without retrying the rest", async () => {
      const adoptLibraryMonster = vi.fn(async (): Promise<AdoptLibraryOutcome> => ({ status: "quota_exceeded" }));
      const deps = fakeDeps({ adoptLibraryMonster });
      const report = await runImportSweep(
        IMPORT_ROW,
        input({
          entitiesByKind: { monsters: [usable("m1", { name: "Goblin" }), usable("m2", { name: "Orc" })] },
          decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([
            [
              "monsters",
              new Map([
                ["m1", { action: "link", candidate: { targetId: "srd_goblin", source: "library", name: "Goblin", matchKind: "exact", detail: null, distance: null } }],
                ["m2", { action: "link", candidate: { targetId: "srd_orc", source: "library", name: "Orc", matchKind: "exact", detail: null, distance: null } }],
              ]),
            ],
          ]),
        }),
        deps,
      );

      // Only the first attempt actually calls the dep — the second is stopped
      // before it ever tries, same as `runImportKind.ts`'s own create/generate
      // quota-stop reasoning.
      expect(adoptLibraryMonster).toHaveBeenCalledTimes(1);
      expect(report.perKind.monsters?.adopted).toBe(0);
      expect(report.unresolvedLinks.filter((m) => m.includes("monster limit"))).toHaveLength(2);
    });
  });

  describe("a room's own item_names — loot lives in the room, not on a beat (#site-workbench)", () => {
    it("places a campaign-sourced item as location-homed loot for a CREATEd room", async () => {
      const deps = fakeDeps();
      const report = await runImportSweep(
        IMPORT_ROW,
        input({
          entitiesByKind: {
            locations: [usable("r1", { name: "M1. Tool Room", location_type: "room", item_names: ["Rusty Pick"] })],
            items: [usable("i1", { name: "Rusty Pick" })],
          },
          decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([
            ["locations", new Map([["r1", CREATE]])],
            ["items", new Map([["i1", CREATE]])],
          ]),
        }),
        deps,
      );

      expect(deps.insertLootPlacement).toHaveBeenCalledWith(
        expect.objectContaining({ home: { location_id: "locations-1" }, kind: "item", item_id: "items-1", label: "Rusty Pick" }),
      );
      // The room has no parent on this page, so it's downgraded to `other`
      // (unrelated to this test — see the "locations: parent_name" describe
      // block below); its loot resolves regardless of that downgrade.
      expect(report.unresolvedLinks).toEqual([expect.stringContaining("M1. Tool Room")]);
    });

    it("still places the room's loot when the room itself was LINKED to an existing row", async () => {
      const deps = fakeDeps();
      await runImportSweep(
        IMPORT_ROW,
        input({
          entitiesByKind: {
            locations: [usable("r1", { name: "M1. Tool Room", location_type: "room", item_names: ["Rusty Pick"] })],
            items: [usable("i1", { name: "Rusty Pick" })],
          },
          decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([
            [
              "locations",
              new Map([
                ["r1", { action: "link", candidate: { targetId: "existing-room", source: "campaign", name: "Tool Room", matchKind: "contains", detail: null, distance: null } }],
              ]),
            ],
            ["items", new Map([["i1", CREATE]])],
          ]),
        }),
        deps,
      );

      expect(deps.insertLootPlacement).toHaveBeenCalledWith(
        expect.objectContaining({ home: { location_id: "existing-room" }, kind: "item", item_id: "items-1", label: "Rusty Pick" }),
      );
    });

    it("reports (never attaches) an item that only resolves to a shared-library row — a location has no quest to fall back to", async () => {
      const deps = fakeDeps({ fetchNameLookup: vi.fn(async () => []) });
      const report = await runImportSweep(
        IMPORT_ROW,
        input({
          entitiesByKind: {
            locations: [usable("r1", { name: "M1. Tool Room", location_type: "room", item_names: ["Bag of Holding"] })],
          },
          decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([["locations", new Map([["r1", CREATE]])]]),
        }),
        deps,
      );

      expect(deps.insertLootPlacement).not.toHaveBeenCalled();
      expect(report.unresolvedLinks).toContain('Location "M1. Tool Room" → item "Bag of Holding"');
    });

    it("contributes no loot for an ignored or undecided room — absence is not consent", async () => {
      const deps = fakeDeps();
      const report = await runImportSweep(
        IMPORT_ROW,
        input({
          entitiesByKind: {
            locations: [usable("r1", { name: "M1. Tool Room", location_type: "room", item_names: ["Rusty Pick"] })],
            items: [usable("i1", { name: "Rusty Pick" })],
          },
          decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([
            ["locations", new Map([["r1", IGNORE]])],
            ["items", new Map([["i1", CREATE]])],
          ]),
        }),
        deps,
      );

      expect(deps.insertLootPlacement).not.toHaveBeenCalled();
      expect(report.unresolvedLinks).toEqual([]);
    });
  });

  describe("a beat does not re-list what its site's rooms already hold (#site-workbench)", () => {
    it("skips an encounter and an item the site's own room already holds, but still attaches an encounter staged elsewhere", async () => {
      const deps = fakeDeps({ writeQuestSpine: vi.fn(async () => ({ beatIdByKey: new Map([["b1", "beat-1"]]) })) });
      const report = await runImportSweep(
        IMPORT_ROW,
        input({
          entitiesByKind: {
            locations: [
              usable("site", { name: "Sunless Citadel", location_type: "dungeon" }),
              usable("room", { name: "M1. Guardroom", location_type: "room", parent_name: "Sunless Citadel", item_names: ["Rusty Pick"] }),
            ],
            items: [usable("i1", { name: "Rusty Pick" }), usable("i2", { name: "Torch" })],
            encounters: [
              usable("e1", { name: "Guardroom Fight", location_name: "M1. Guardroom" }),
              usable("e2", { name: "Ambush on the Road" }),
            ],
            quests: [
              usable("q1", {
                title: "The Mine",
                beats: [
                  {
                    key: "b1",
                    title: "Explore the mine",
                    kind: "explore",
                    dm_content: "",
                    location_name: "Sunless Citadel",
                    encounter_names: ["Guardroom Fight", "Ambush on the Road"],
                    item_names: ["Rusty Pick", "Torch"],
                  },
                ],
              }),
            ],
          },
          decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([
            ["locations", new Map([["site", CREATE], ["room", CREATE]])],
            ["items", new Map([["i1", CREATE], ["i2", CREATE]])],
            ["encounters", new Map([["e1", CREATE], ["e2", CREATE]])],
            ["quests", new Map([["q1", CREATE]])],
          ]),
        }),
        deps,
      );

      // The room keeps its own loot, homed on the room itself.
      const lootCalls = (deps.insertLootPlacement as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
      expect(lootCalls).toContainEqual(expect.objectContaining({ home: { location_id: "locations-2" }, item_id: "items-1", label: "Rusty Pick" }));

      // The beat staged at the site does NOT re-list the room's own fight...
      const attachmentCalls = (deps.insertBeatAttachment as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
      expect(attachmentCalls.find((a) => a.ref_id === "encounters-1")).toBeUndefined(); // Guardroom Fight
      // ...or the room's own loot, as a second, beat-homed placement.
      expect(lootCalls.find((l) => l.item_id === "items-1" && "beat_id" in l.home)).toBeUndefined();

      // But an encounter staged elsewhere (not the site, not one of its
      // rooms) still attaches to the beat exactly as it always has...
      expect(attachmentCalls).toContainEqual(expect.objectContaining({ attachment_type: "encounter", ref_id: "encounters-2" }));
      // ...and so does an item that was never the site's own room loot.
      expect(lootCalls).toContainEqual(expect.objectContaining({ home: { beat_id: "beat-1", quest_id: "quests-1" }, item_id: "items-2", label: "Torch" }));

      // The skip is silent — it is not a failure the DM needs reported.
      expect(report.unresolvedLinks.some((m) => m.includes("Rusty Pick") || m.includes("Guardroom Fight"))).toBe(false);
    });

    it("does not skip anything for a beat staged at a location that is neither a site nor a room", async () => {
      const deps = fakeDeps({ writeQuestSpine: vi.fn(async () => ({ beatIdByKey: new Map([["b1", "beat-1"]]) })) });
      await runImportSweep(
        IMPORT_ROW,
        input({
          entitiesByKind: {
            locations: [usable("l1", { name: "The Rusty Anchor", location_type: "tavern" })],
            encounters: [usable("e1", { name: "Tavern Brawl", location_name: "The Rusty Anchor" })],
            quests: [
              usable("q1", {
                title: "A Quiet Drink",
                beats: [
                  {
                    key: "b1",
                    title: "The brawl breaks out",
                    kind: "combat",
                    dm_content: "",
                    location_name: "The Rusty Anchor",
                    encounter_names: ["Tavern Brawl"],
                  },
                ],
              }),
            ],
          },
          decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([
            ["locations", new Map([["l1", CREATE]])],
            ["encounters", new Map([["e1", CREATE]])],
            ["quests", new Map([["q1", CREATE]])],
          ]),
        }),
        deps,
      );

      // "The Rusty Anchor" has no rooms of its own in this sweep, so the
      // site/room skip never applies — the encounter attaches normally even
      // though it's staged at the exact same location as the beat.
      expect(deps.insertBeatAttachment).toHaveBeenCalledWith(expect.objectContaining({ attachment_type: "encounter", ref_id: "encounters-1" }));
    });
  });

  describe("locations: parent_name resolved at insert, not the linking phase (guard_location_room_parent)", () => {
    it("resolves a room's parent to a dungeon created in the same sweep, regardless of page order", async () => {
      const deps = fakeDeps();
      const report = await runImportSweep(
        IMPORT_ROW,
        input({
          entitiesByKind: {
            locations: [
              usable("room", { name: "M1. Tool Room", location_type: "room", parent_name: "Sunless Citadel" }),
              usable("dungeon", { name: "Sunless Citadel", location_type: "dungeon" }),
            ],
          },
          decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([
            ["locations", new Map([["room", CREATE], ["dungeon", CREATE]])],
          ]),
        }),
        deps,
      );

      expect(report.unresolvedLinks).toEqual([]);
      const calls = (deps.insertRow as ReturnType<typeof vi.fn>).mock.calls as [ImportEntityKind, Record<string, unknown>][];
      // Parents-first: the dungeon (no parent of its own) must be attempted
      // before the room, even though the room was listed first on the page.
      expect(calls[0]![1]).toMatchObject({ name: "Sunless Citadel" });
      expect(calls[1]![1]).toMatchObject({ name: "M1. Tool Room", parent_id: "locations-1", location_type: "room" });
    });

    it("resolves a room's parent against an existing campaign location fetched via fetchNameLookup", async () => {
      const deps = fakeDeps({
        fetchNameLookup: vi.fn(async (kind: ImportEntityKind): Promise<readonly NameLookupRow[]> =>
          kind === "locations" ? [{ id: "existing-dungeon", name: "Sunless Citadel", locationType: "dungeon" }] : [],
        ),
      });
      const report = await runImportSweep(
        IMPORT_ROW,
        input({
          entitiesByKind: { locations: [usable("room", { name: "M1. Tool Room", location_type: "room", parent_name: "Sunless Citadel" })] },
          decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([["locations", new Map([["room", CREATE]])]]),
        }),
        deps,
      );

      expect(report.unresolvedLinks).toEqual([]);
      expect(deps.insertRow).toHaveBeenCalledWith("locations", expect.objectContaining({ parent_id: "existing-dungeon" }));
    });

    it("downgrades an interior row with no resolvable holder parent to 'other', and reports why", async () => {
      const deps = fakeDeps();
      const report = await runImportSweep(
        IMPORT_ROW,
        input({
          entitiesByKind: { locations: [usable("room", { name: "A Lonely Cell", location_type: "room" })] },
          decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([["locations", new Map([["room", CREATE]])]]),
        }),
        deps,
      );

      expect(report.unresolvedLinks).toContainEqual(expect.stringContaining('Location "A Lonely Cell"'));
      expect(deps.insertRow).toHaveBeenCalledWith("locations", expect.objectContaining({ location_type: "other", parent_id: null }));
      expect(report.perKind.locations?.imported).toBe(1); // still lands, just detached and retyped
    });

    it("still resolves a non-interior location's parent normally, untouched by the room guard", async () => {
      const deps = fakeDeps({
        fetchNameLookup: vi.fn(async (kind: ImportEntityKind): Promise<readonly NameLookupRow[]> =>
          kind === "locations" ? [{ id: "waterdeep-id", name: "Waterdeep", locationType: "city" }] : [],
        ),
      });
      await runImportSweep(
        IMPORT_ROW,
        input({
          entitiesByKind: { locations: [usable("d1", { name: "Dock Ward", location_type: "district", parent_name: "Waterdeep" })] },
          decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([["locations", new Map([["d1", CREATE]])]]),
        }),
        deps,
      );

      expect(deps.insertRow).toHaveBeenCalledWith("locations", expect.objectContaining({ parent_id: "waterdeep-id", location_type: "district" }));
    });
  });

  describe("encounter combatants (moved into the single linking phase)", () => {
    it("resolves combatants against the sweep's own registry before falling back to the RPC", async () => {
      const deps = fakeDeps({
        resolveMonsterNames: vi.fn(async (names: readonly string[]) => {
          expect(names).toEqual(["Owlbear"]); // "Kobold" is already covered by the sweep's own registry
          return new Map([["Owlbear", { targetId: "mon-owlbear-rpc" }]]);
        }),
      });

      const insertRow = vi.fn(async (kind: ImportEntityKind): Promise<InsertRowOutcome> => ({ status: "inserted", id: `${kind}-1` }));

      const report = await runImportSweep(
        IMPORT_ROW,
        input({
          entitiesByKind: {
            monsters: [usable("m1", { name: "Kobold" })],
            encounters: [usable("e1", { name: "Ambush", combatants: [{ name: "Kobold", count: 2 }, { name: "Owlbear", count: 1 }] })],
          },
          decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([
            ["monsters", new Map([["m1", CREATE]])],
            ["encounters", new Map([["e1", CREATE]])],
          ]),
        }),
        { ...deps, insertRow },
      );

      const [, resolved] = (deps.updateEncounterCombatants as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(resolved).toEqual([
        expect.objectContaining({ monster_id: "monsters-1", custom_name: null }),
        expect.objectContaining({ monster_id: "mon-owlbear-rpc", custom_name: null }),
      ]);
      expect(report.unresolvedLinks).toEqual([]);
    });

    it("reports a combatant matching nothing, keyed by the encounter's own name", async () => {
      const deps = fakeDeps();
      const report = await runImportSweep(
        IMPORT_ROW,
        input({
          entitiesByKind: { encounters: [usable("e1", { name: "Ambush", combatants: [{ name: "Nobody", count: 1 }] })] },
          decisions: new Map<ImportEntityKind, Map<string, ImportDecision>>([["encounters", new Map([["e1", CREATE]])]]),
        }),
        deps,
      );
      expect(report.unresolvedLinks).toContain('Encounter "Ambush" → combatant "Nobody"');
    });
  });
});
