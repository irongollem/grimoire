import { describe, expect, it } from "vitest";
import { badgesFor, buildRestGraph, entityDirectory, EMPTY_FILTERS, pairKey, type WebEntity } from "./model";
import { tie } from "./tieFixture";

const person = (id: string, name: string, kind: "npc" | "party_member" = "npc"): WebEntity => ({
  key: `${kind}:${id}`, kind, id, name, image: null, attitude: null,
});

const ties = [
  tie({ row_id: "1" }), // Brenna worships the Lady (link)
  tie({ row_id: "2", source: "membership", type: "member_of", from_id: "brenna", to_kind: "faction", to_id: "thane", to_name: "House Thane", role: "Heir", status: "Active" }),
  tie({ row_id: "3", source: "npc_home", type: "lives_in", from_id: "brenna", to_kind: "location", to_id: "crossing", to_name: "Thane's Crossing" }),
  tie({ row_id: "4", source: "kin", type: "parent_of", from_id: "maera", from_name: "Maera Thane", to_kind: "npc", to_id: "brenna", to_name: "Brenna Ashe" }),
  tie({ row_id: "5", type: "friend", from_id: "maera", from_name: "Maera Thane", to_kind: "npc", to_id: "brenna", to_name: "Brenna Ashe" }),
];
const people = [person("brenna", "Brenna Ashe"), person("maera", "Maera Thane"), person("loner", "Loner")];

describe("buildRestGraph", () => {
  const directory = entityDirectory(ties, people);

  it("draws people always and other kinds only with a line", () => {
    const graph = buildRestGraph(directory, ties, EMPTY_FILTERS);
    expect([...graph.nodes.keys()].sort()).toEqual(["deity:lady", "npc:brenna", "npc:loner", "npc:maera"]);
    // The faction and the place have only records: not nodes at rest.
    expect(graph.nodes.has("faction:thane")).toBe(false);
    expect(graph.nodes.has("location:crossing")).toBe(false);
  });

  it("merges kin and a bond between the same two into one kin line", () => {
    const graph = buildRestGraph(directory, ties, EMPTY_FILTERS);
    const edge = graph.edges.find((e) => e.key === pairKey("npc:maera", "npc:brenna"));
    expect(edge).toMatchObject({ family: "kin", arrow: true, source: "npc:maera", target: "npc:brenna", label: "parent of +1" });
    expect(edge?.ties).toHaveLength(2);
    expect(graph.edges).toHaveLength(2);
  });

  it("keeps the kin line as the primary tie whichever order the ties arrive in", () => {
    const reversed = [...ties].reverse();
    const edge = buildRestGraph(entityDirectory(reversed, people), reversed, EMPTY_FILTERS).edges.find((e) => e.key === pairKey("npc:maera", "npc:brenna"));
    expect(edge).toMatchObject({ family: "kin", arrow: true, label: "parent of +1" });
  });

  it("keeps a pinned node on screen though its kind is hidden", () => {
    const graph = buildRestGraph(directory, ties, { ...EMPTY_FILTERS, hiddenKinds: new Set(["npc"]), pinned: new Set(["npc:brenna"]) });
    expect([...graph.nodes.keys()].sort()).toEqual(["deity:lady", "npc:brenna"]);
  });

  it("counts nodes per kind before the chips narrow anything", () => {
    const hidden = buildRestGraph(directory, ties, { ...EMPTY_FILTERS, hiddenKinds: new Set(["deity"]) });
    expect(hidden.nodes.has("deity:lady")).toBe(false);
    expect(hidden.counts.get("deity")).toBe(1);
    expect(hidden.edges.map((e) => e.key)).toEqual([pairKey("npc:maera", "npc:brenna")]);
  });

  it("searches by name but keeps a pinned node", () => {
    const found = buildRestGraph(directory, ties, { ...EMPTY_FILTERS, search: "loner" });
    expect([...found.nodes.keys()]).toEqual(["npc:loner"]);
    const pinned = buildRestGraph(directory, ties, { ...EMPTY_FILTERS, search: "loner", pinned: new Set(["npc:brenna"]) });
    expect([...pinned.nodes.keys()].sort()).toEqual(["npc:brenna", "npc:loner"]);
  });

  it("filters the lines by family", () => {
    const faith = buildRestGraph(directory, ties, { ...EMPTY_FILTERS, family: "faith" });
    expect(faith.edges.map((e) => e.family)).toEqual(["faith"]);
  });

  it("draws a pinned record-only node, as a group's own node is", () => {
    const graph = buildRestGraph(directory, ties, { ...EMPTY_FILTERS, pinned: new Set(["faction:thane"]) });
    expect(graph.nodes.has("faction:thane")).toBe(true);
  });
});

describe("entityDirectory", () => {
  it("lets a person given by the caller replace the bare name a tie carried", () => {
    const given: WebEntity = { ...person("brenna", "Brenna Ashe"), attitude: "friendly" };
    expect(entityDirectory(ties, [given]).get("npc:brenna")?.attitude).toBe("friendly");
  });
});

describe("badgesFor", () => {
  it("gives a badge for memberships only, not for other ties to a faction", () => {
    const other = tie({ row_id: "9", type: "friend", from_id: "loner", to_kind: "faction", to_id: "thane", to_name: "House Thane" });
    expect(badgesFor([...ties, other]).has("npc:loner")).toBe(false);
  });

  it("turns memberships into faction badges on the person", () => {
    const badges = badgesFor(ties);
    expect(badges.get("npc:brenna")?.pips[0]).toMatchObject({ factionName: "House Thane", role: "Heir", active: true });
  });
});
