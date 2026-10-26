import { describe, expect, it } from "vitest";
import { buildFocus, indexTies, layoutRings, RING_CAP } from "./focus";
import { tie } from "./tieFixture";

const ties = [
  tie({ row_id: "1" }), // brenna worships lady
  tie({ row_id: "2", type: "serves", from_id: "ama", from_name: "Sister Ama" }),
  tie({ row_id: "3", source: "patron_deity", type: "patron_deity", from_kind: "party_member", from_id: "ilse", from_name: "Ilse Thane" }),
  tie({ row_id: "4", type: "opposes", from_kind: "faction", from_id: "toll", from_name: "Toll-men", to_kind: "deity" }),
  tie({ row_id: "5", source: "membership", type: "member_of", from_id: "harl", from_name: "Harl", to_kind: "faction", to_id: "toll", to_name: "Toll-men" }),
  tie({ row_id: "6", type: "friend", from_id: "brenna", to_kind: "npc", to_id: "ama", to_name: "Sister Ama" }),
];
const names = new Map<string, string>();
for (const t of ties) {
  names.set(`${t.from_kind}:${t.from_id}`, t.from_name);
  names.set(`${t.to_kind}:${t.to_id}`, t.to_name);
}
const nameOf = (k: string) => names.get(k) ?? k;
const index = indexTies(ties);

describe("buildFocus", () => {
  it("puts everything one step away in ring one with the reason read from its own end", () => {
    const g = buildFocus(index, "deity:lady", 1, nameOf);
    const ring1 = g.nodes.filter((n) => n.ring === 1);
    expect(ring1.map((n) => n.key).sort()).toEqual(["faction:toll", "npc:ama", "npc:brenna", "party_member:ilse"]);
    expect(ring1.find((n) => n.key === "npc:brenna")?.reasons).toEqual(["worships"]);
    expect(ring1.find((n) => n.key === "party_member:ilse")?.reasons).toEqual(["patron deity"]);
    expect(ring1.find((n) => n.key === "faction:toll")?.reasons).toEqual(["opposes"]);
  });

  it("draws records as dashed spokes and links solid", () => {
    const g = buildFocus(index, "deity:lady", 1, nameOf);
    expect(g.edges.find((e) => e.tie.source === "patron_deity")?.dashed).toBe(true);
    expect(g.edges.find((e) => e.tie.type === "worships")?.dashed).toBe(false);
  });

  it("adds a faded second ring only on request", () => {
    expect(buildFocus(index, "deity:lady", 1, nameOf).nodes.some((n) => n.ring === 2)).toBe(false);
    const g = buildFocus(index, "deity:lady", 2, nameOf);
    const second = g.nodes.filter((n) => n.ring === 2);
    expect(second.map((n) => n.key)).toEqual(["npc:harl"]);
    expect(g.edges.find((e) => e.tie.row_id === "5")?.faded).toBe(true);
  });

  it("does not draw ties between two first-ring nodes", () => {
    const g = buildFocus(index, "deity:lady", 1, nameOf);
    expect(g.edges.some((e) => e.tie.row_id === "6")).toBe(false);
  });

  it("caps a crowded ring and says how many it left out", () => {
    const crowd = Array.from({ length: RING_CAP.first + 5 }, (_, i) =>
      tie({ row_id: `c${i}`, source: "membership", type: "member_of", from_id: `m${i}`, from_name: `M${i}`, to_kind: "faction", to_id: "guild", to_name: "Guild" }),
    );
    const g = buildFocus(indexTies(crowd), "faction:guild", 1, (k) => k);
    expect(g.nodes.filter((n) => n.ring === 1)).toHaveLength(RING_CAP.first);
    expect(g.hidden.first).toBe(5);
  });

  it("is just the centre when nothing touches it", () => {
    const g = buildFocus(index, "item:bell", 2, nameOf);
    expect(g.nodes).toEqual([{ key: "item:bell", ring: 0, reasons: [] }]);
  });
});

describe("layoutRings", () => {
  it("puts the centre at the origin and ring one on a circle round it", () => {
    const placed = layoutRings(buildFocus(index, "deity:lady", 1, nameOf));
    const centre = placed.find((p) => p.ring === 0);
    expect(centre).toMatchObject({ x: 0, y: 0 });
    const radii = placed.filter((p) => p.ring === 1).map((p) => Math.round(Math.hypot(p.x, p.y)));
    expect(new Set(radii).size).toBe(1);
  });

  it("puts the second ring outside the first", () => {
    const placed = layoutRings(buildFocus(index, "deity:lady", 2, nameOf));
    const r1 = Math.hypot(...Object.values(placed.find((p) => p.ring === 1)!).slice(1, 3) as [number, number]);
    const second = placed.find((p) => p.ring === 2)!;
    expect(Math.hypot(second.x, second.y)).toBeGreaterThan(r1);
  });
});
