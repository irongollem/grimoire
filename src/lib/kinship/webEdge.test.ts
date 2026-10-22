import { describe, expect, it } from "vitest";
import { kinWebEdges, webPairKey } from "./webEdge";
import type { KinKind, KinLink } from "@/types/kinship.types";

function link(kind: KinKind, over: Partial<KinLink> = {}): KinLink {
  return {
    id: `${kind}-${Math.random()}`,
    user_id: "u",
    campaign_id: "c",
    from_npc_id: "a",
    from_party_member_id: null,
    to_npc_id: "b",
    to_party_member_id: null,
    kind,
    parent_role: null,
    adoptive: false,
    note: "",
    needs_sorting: false,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("kinWebEdges", () => {
  it("points a parent line from parent to child and words it", () => {
    const [edge] = kinWebEdges([link("parent")]);
    expect(edge).toMatchObject({ source: "npc:a", target: "npc:b", arrow: true, label: "parent", dashed: false });
  });
  it("dashes former spouses and adoptive parents", () => {
    expect(kinWebEdges([link("former_spouse")])[0]).toMatchObject({ dashed: true, label: "former spouse" });
    expect(kinWebEdges([link("parent", { adoptive: true })])[0]).toMatchObject({ dashed: true, arrow: true });
  });
  it("keeps one edge per pair, the stronger kind winning", () => {
    const edges = kinWebEdges([link("relative"), link("spouse", { from_npc_id: "b", to_npc_id: "a" })]);
    expect(edges).toHaveLength(1);
    expect(edges[0]?.kind).toBe("spouse");
  });
  it("keys an NPC-PC pair NPC first, like the PC-note edges", () => {
    const [edge] = kinWebEdges([link("sibling", { from_npc_id: null, from_party_member_id: "p", to_npc_id: "n" })]);
    expect(edge?.key).toBe("npc:n--pc:p");
    expect(webPairKey("pc:p", "npc:n")).toBe("npc:n--pc:p");
  });
});
