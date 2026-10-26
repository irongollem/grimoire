import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { WORLD_LINK_PAIRS } from "@edge-shared/worldLinkCatalogue.ts";
import { describe, expect, it } from "vitest";
import type { AiProvenance } from "@/ai/provenance";
import { EXTRACTED_BOND_TYPES, EXTRACTED_STANCES } from "@/types/documentImport.types";
import { planWorldLinks } from "./importSweepWorldLinks";

const PROVENANCE = { model: "test" } as unknown as AiProvenance;
const lookups = {
  npcs: [{ id: "n-tam", name: "Tam" }, { id: "n-orsik", name: "Orsik" }],
  factions: [{ id: "f-watch", name: "The Watch" }, { id: "f-ledger", name: "The Ledger" }],
  locations: [{ id: "l-dock", name: "Dock Ward" }],
};

function plan(npcLinks: object, factionLinks: object = {}) {
  return planWorldLinks(
    [{ id: "n-tam", links: npcLinks }],
    [{ id: "f-watch", links: factionLinks }],
    lookups,
    "c1",
    PROVENANCE,
  );
}

describe("planWorldLinks", () => {
  it("stores a directed bond from the person it is 'of'", () => {
    const { writes } = plan({ bonds: [{ name: "Orsik", type: "mentor" }] });
    expect(writes).toEqual([
      expect.objectContaining({ type: "mentor_of", from_kind: "npc", to_kind: "npc", from_npc_id: "n-orsik", to_npc_id: "n-tam", campaign_id: "c1" }),
    ]);
    const apprentice = plan({ bonds: [{ name: "Orsik", type: "apprentice" }] }).writes;
    expect(apprentice[0]).toMatchObject({ type: "mentor_of", from_npc_id: "n-tam", to_npc_id: "n-orsik" });
  });

  it("maps a near-miss word to the nearest type and drops one it cannot", () => {
    expect(plan({ bonds: [{ name: "Orsik", type: "Teacher" }] }).writes[0]).toMatchObject({ type: "mentor_of" });
    const dropped = plan({ bonds: [{ name: "Orsik", type: "nemesis-ish" }] });
    expect(dropped.writes).toEqual([]);
    expect(dropped.unresolved).toEqual([expect.objectContaining({ targetLabel: "bond", name: "Orsik" })]);
  });

  it("writes a symmetric bond stated from both ends once", () => {
    const { writes } = planWorldLinks(
      [
        { id: "n-tam", links: { bonds: [{ name: "Orsik", type: "friend" }] } },
        { id: "n-orsik", links: { bonds: [{ name: "Tam", type: "friend" }] } },
      ],
      [],
      lookups,
      "c1",
      PROVENANCE,
    );
    expect(writes).toHaveLength(1);
  });

  it("keeps one stance per ordered pair of factions and ignores a stance toward itself", () => {
    const { writes } = plan({}, {
      stances: [
        { name: "The Ledger", stance: "hostile" },
        { name: "The Ledger", stance: "Rival" },
        { name: "The Watch", stance: "allied" },
      ],
    });
    expect(writes).toEqual([expect.objectContaining({ type: "hostile", from_faction_id: "f-watch", to_faction_id: "f-ledger" })]);
  });

  it("reports an unknown name without dropping the rest", () => {
    const { writes, unresolved } = plan({}, { location_names: ["Dock Ward", "Atlantis"], controlled_location_names: ["Dock Ward"] });
    expect(writes.map((w) => w.type)).toEqual(["operates_in", "controls"]);
    expect(unresolved).toEqual([{ sourceKind: "factions", sourceId: "f-watch", targetLabel: "location", name: "Atlantis" }]);
  });

  it("holds every extracted word to the catalogue", () => {
    const people = WORLD_LINK_PAIRS.find((p) => p.pair === "person_person")!.types.map((t) => t.key);
    const stances = WORLD_LINK_PAIRS.find((p) => p.pair === "faction_faction")!.types.map((t) => t.key);
    for (const word of EXTRACTED_STANCES) expect(stances).toContain(word);
    // Every bond word writes a row the catalogue accepts.
    for (const type of EXTRACTED_BOND_TYPES) {
      const { writes } = plan({ bonds: [{ name: "Orsik", type }] });
      expect(writes, type).toHaveLength(1);
      expect(people).toContain(writes[0]!.type);
    }
  });

  it("mirrors the wire schema's bond words, which cannot import this module", () => {
    const source = readFileSync(resolve(process.cwd(), "supabase/functions/import-extract/extractionSchema.ts"), "utf8");
    const match = /const BOND_TYPES = \[([\s\S]*?)\] as const/.exec(source);
    if (!match) throw new Error("extractionSchema.ts has no BOND_TYPES to check");
    const schemaWords = [...match[1]!.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(schemaWords.sort()).toEqual([...EXTRACTED_BOND_TYPES].sort());
    const stances = WORLD_LINK_PAIRS.find((p) => p.pair === "faction_faction")!.types.map((t) => t.key);
    expect([...EXTRACTED_STANCES].sort()).toEqual(stances.sort());
  });
});
