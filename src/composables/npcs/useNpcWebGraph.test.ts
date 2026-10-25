import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useNpcWebGraph, type NpcWebGraphInput } from "./useNpcWebGraph";
import { useNpcsUiStore } from "@/stores/ui/npcs";
import type { NpcListRow, NpcRelation } from "@/types/npc.types";
import type { KinLink } from "@/types/kinship.types";

const npc = (id: string) => ({ id, name: id, relationship: "unknown", location_id: null }) as unknown as NpcListRow;
const bond = (a: string, b: string) =>
  ({ npc_id: a, related_npc_id: b, relationship_type: "friend" }) as unknown as NpcRelation;
const kin = (kind: KinLink["kind"], over: Partial<KinLink> = {}): KinLink =>
  ({
    id: "k1",
    from_npc_id: "a",
    from_party_member_id: null,
    to_npc_id: "b",
    to_party_member_id: null,
    kind,
    adoptive: false,
    ...over,
  }) as KinLink;

function graph(over: Partial<NpcWebGraphInput> = {}) {
  return useNpcWebGraph({
    npcs: () => [npc("a"), npc("b"), npc("c")],
    partyMembers: () => [],
    relations: () => [],
    pcNotes: () => [],
    kinLinks: () => [],
    pinnedKeys: () => new Set(),
    factionGroups: () => new Map(),
    getDescendantIds: () => new Set(),
    focusedKeys: () => new Set(),
    ...over,
  });
}

describe("useNpcWebGraph kin edges", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("draws a kin link as an arrowed, worded edge", () => {
    const { graphEdges } = graph({ kinLinks: () => [kin("parent")] });
    expect(graphEdges.value["npc:a--npc:b"]).toMatchObject({ source: "npc:a", target: "npc:b", arrow: true, label: "parent" });
  });

  it("collapses a pair that is both bond and kin to the kin edge", () => {
    const { graphEdges } = graph({ kinLinks: () => [kin("sibling")], relations: () => [bond("b", "a")] });
    expect(Object.keys(graphEdges.value)).toEqual(["npc:a--npc:b"]);
    expect(graphEdges.value["npc:a--npc:b"]?.label).toBe("sibling");
  });

  it("the Family filter shows only kin; a bond-type filter hides kin", () => {
    const ui = useNpcsUiStore();
    const { graphEdges } = graph({ kinLinks: () => [kin("spouse")], relations: () => [bond("b", "c")] });
    ui.npcWebFilterType = "kin";
    expect(Object.keys(graphEdges.value)).toEqual(["npc:a--npc:b"]);
    ui.npcWebFilterType = "friend";
    expect(Object.keys(graphEdges.value)).toEqual(["npc:b--npc:c"]);
  });

  it("leaves out kin to a PC while PCs are hidden", () => {
    const ui = useNpcsUiStore();
    ui.npcWebShowPcs = false;
    const { graphEdges } = graph({
      kinLinks: () => [kin("sibling", { to_npc_id: null, to_party_member_id: "p" })],
    });
    expect(Object.keys(graphEdges.value)).toEqual([]);
  });
});

describe("useNpcWebGraph directed bonds", () => {
  beforeEach(() => setActivePinia(createPinia()));
  const typed = (a: string, b: string, relationship_type: string) =>
    ({ npc_id: a, related_npc_id: b, relationship_type }) as unknown as NpcRelation;

  it("points from the superior to the subordinate, whichever end the row was written from", () => {
    // "b is a's superior" and "a is b's subordinate" are the same fact, and draw the same arrow.
    for (const row of [typed("a", "b", "superior"), typed("b", "a", "subordinate")]) {
      const { graphEdges } = graph({ relations: () => [row] });
      expect(Object.values(graphEdges.value)[0]).toMatchObject({ source: "npc:b", target: "npc:a", arrow: true, label: "superior" });
    }
  });

  it("points from the mentor to the apprentice", () => {
    const { graphEdges } = graph({ relations: () => [typed("a", "b", "apprentice")] });
    expect(Object.values(graphEdges.value)[0]).toMatchObject({ source: "npc:a", target: "npc:b", arrow: true, label: "mentor" });
  });

  it("leaves a symmetric bond without an arrow", () => {
    const { graphEdges } = graph({ relations: () => [bond("a", "b")] });
    expect(Object.values(graphEdges.value)[0].arrow).toBeUndefined();
  });
});
