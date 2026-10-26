import { describe, expect, it } from "vitest";
import { useWorldWebGraph } from "./useWorldWebGraph";
import { buildRestGraph, entityDirectory, EMPTY_FILTERS } from "@/lib/worldWeb/model";
import { tie } from "@/lib/worldWeb/tieFixture";

const ties = [
  tie({ row_id: "1" }),
  tie({ row_id: "2", source: "kin", type: "sibling_of", from_id: "maera", from_name: "Maera", to_kind: "npc", to_id: "brenna", to_name: "Brenna Ashe" }),
];

function graph() {
  const rest = buildRestGraph(entityDirectory(ties, []), ties, EMPTY_FILTERS);
  return useWorldWebGraph({ graph: () => rest, group: () => null });
}

describe("useWorldWebGraph", () => {
  it("draws a node per thing with a line, sized by kind", () => {
    const { graphNodes, nodeCount } = graph();
    expect(nodeCount.value).toBe(3);
    expect(graphNodes.value["deity:lady"]).toMatchObject({ kind: "deity", name: "The Drowned Lady", nodeSize: 19 });
  });

  it("words only the kin line, and colours each line by its family", () => {
    const { graphEdges } = graph();
    const faith = graphEdges.value["deity:lady--npc:brenna"];
    const kin = graphEdges.value["npc:brenna--npc:maera"];
    expect(faith).toMatchObject({ family: "faith", label: undefined, arrow: false });
    expect(kin).toMatchObject({ family: "kin", label: "sibling of", arrow: false });
    expect(faith.edgeColor).toBeTruthy();
  });
});
