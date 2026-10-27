import { describe, expect, it } from "vitest";
import type { AiProvenance } from "@/ai/provenance";
import { planNpcKin } from "./importSweepKin";

const PROVENANCE: AiProvenance = {
  generatorType: "document_import",
  provider: "anthropic",
  model: "claude-test",
  generatedAt: "2026-10-22T00:00:00.000Z",
  edited: false,
};
const npcs = [
  { id: "baron", name: "Baron Vargas" },
  { id: "izek", name: "Izek" },
  { id: "ireena", name: "Ireena" },
];

describe("planNpcKin", () => {
  it("makes the named person the subject: on Izek, the Baron as parent is the Baron's parent link", () => {
    const { writes } = planNpcKin([{ id: "izek", links: { kin: [{ name: "The Baron Vargas", relation: "parent" }] } }], npcs, "c1", PROVENANCE);
    expect(writes).toEqual([
      expect.objectContaining({ campaign_id: "c1", kind: "parent", from_npc_id: "baron", to_npc_id: "izek", ai_provenance: PROVENANCE }),
    ]);
  });

  it("links to the first NPC listed when two share a name (the sweep's own rows come first)", () => {
    const twins = [{ id: "izek-new", name: "Izek" }, { id: "izek-old", name: "Izek" }, ...npcs.filter((n) => n.id !== "izek")];
    const { writes } = planNpcKin([{ id: "baron", links: { kin: [{ name: "Izek", relation: "child" }] } }], twins, "c1", PROVENANCE);
    expect(writes[0]).toMatchObject({ from_npc_id: "baron", to_npc_id: "izek-new" });
  });

  it("reads child the other way round, and keeps symmetric kinds as written", () => {
    const { writes } = planNpcKin(
      [{ id: "baron", links: { kin: [{ name: "Izek", relation: "child" }, { name: "Ireena", relation: "spouse" }] } }],
      npcs,
      "c1",
      PROVENANCE,
    );
    // Izek is the child of the Baron: the Baron is the parent, so the link runs Baron to Izek.
    expect(writes[0]).toMatchObject({ kind: "parent", from_npc_id: "baron", to_npc_id: "izek" });
    expect(writes[1]).toMatchObject({ kind: "spouse", from_npc_id: "ireena", to_npc_id: "baron" });
  });

  it("writes a pair stated from both ends once, and counts what it cannot resolve", () => {
    const { writes, unresolved } = planNpcKin(
      [
        { id: "baron", links: { kin: [{ name: "Izek", relation: "child" }] } },
        { id: "izek", links: { kin: [{ name: "Baron Vargas", relation: "parent" }, { name: "Strahd", relation: "relative" }, { name: "Izek", relation: "sibling" }] } },
      ],
      npcs,
      "c1",
      PROVENANCE,
    );
    expect(writes).toHaveLength(1);
    expect(unresolved).toBe(1);
  });

  it("counts an unknown relation as unresolved", () => {
    const { writes, unresolved } = planNpcKin(
      [{ id: "izek", links: { kin: [{ name: "Ireena", relation: "nemesis" as never }] } }],
      npcs,
      "c1",
      PROVENANCE,
    );
    expect(writes).toEqual([]);
    expect(unresolved).toBe(1);
  });
});
