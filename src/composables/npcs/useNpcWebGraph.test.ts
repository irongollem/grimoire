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
