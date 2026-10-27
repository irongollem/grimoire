import { beforeEach, describe, expect, it } from "vitest";
import { nodeSizeFor, useWorldWebGraph } from "./useWorldWebGraph";
import { buildRestGraph, entityDirectory, EMPTY_FILTERS, type WebEntity } from "@/lib/worldWeb/model";
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
  it("draws a node per thing with a line, named and typed by what it is, and the party members larger than the rest", () => {
    const { graphNodes, nodeCount } = graph();
    expect(nodeCount.value).toBe(3);
    expect(graphNodes.value["deity:lady"]).toMatchObject({ kind: "deity", name: "The Drowned Lady" });
    expect(nodeSizeFor("party_member")).toBeGreaterThan(nodeSizeFor("npc"));
  });

  it("colours a person by their attitude to the party and leaves a place or deity to the default", () => {
    const hostile: WebEntity = { key: "npc:brenna", kind: "npc", id: "brenna", name: "Brenna Ashe", image: null, attitude: "hostile" };
    const rest = buildRestGraph(entityDirectory(ties, [hostile]), ties, EMPTY_FILTERS);
    const { graphNodes } = useWorldWebGraph({ graph: () => rest, group: () => null });
    expect(graphNodes.value["npc:brenna"]?.nodeColor).toBeDefined();
    expect(graphNodes.value["deity:lady"]?.nodeColor).toBeUndefined();
  });

  beforeEach(() => {
    document.documentElement.style.setProperty("--link-faith", "#111111");
    document.documentElement.style.setProperty("--relation-family", "#222222");
  });

  it("words only the kin line, and colours each line by its family", () => {
    const { graphEdges } = graph();
    const faith = graphEdges.value["deity:lady--npc:brenna"];
    const kin = graphEdges.value["npc:brenna--npc:maera"];
    expect(faith).toMatchObject({ family: "faith", label: undefined, arrow: false });
    expect(kin).toMatchObject({ family: "kin", label: "sibling of", arrow: false });
    // Each family is drawn in its own theme token (jsdom has no stylesheet, so give it two).
    expect(faith.edgeColor).toBe("#111111");
    expect(kin.edgeColor).toBe("#222222");
  });
});
