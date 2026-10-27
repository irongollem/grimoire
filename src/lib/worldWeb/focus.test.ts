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

  it("lists a ring in the order people, factions, places, then by name, and each reason once", () => {
    const t = [
      tie({ row_id: "a", type: "serves", from_kind: "faction", from_id: "zed", from_name: "Zed Guild", to_kind: "deity", to_id: "c", to_name: "C" }),
      tie({ row_id: "b", type: "serves", from_kind: "faction", from_id: "alp", from_name: "Alp Guild", to_kind: "deity", to_id: "c", to_name: "C" }),
      tie({ row_id: "c", type: "worships", from_id: "zoe", from_name: "Zoe", to_kind: "deity", to_id: "c", to_name: "C" }),
      tie({ row_id: "d", type: "worships", from_id: "zoe", from_name: "Zoe", to_kind: "deity", to_id: "c", to_name: "C" }),
      tie({ row_id: "e", type: "worships", from_kind: "party_member", from_id: "pc", from_name: "Pip", to_kind: "deity", to_id: "c", to_name: "C" }),
    ];
    const names2 = new Map<string, string>(t.flatMap((x) => [[`${x.from_kind}:${x.from_id}`, x.from_name] as [string, string], [`${x.to_kind}:${x.to_id}`, x.to_name] as [string, string]]));
    const g = buildFocus(indexTies(t), "deity:c", 1, (k) => names2.get(k) ?? k);
    const ring1 = g.nodes.filter((n) => n.ring === 1);
    expect(ring1.map((n) => n.key)).toEqual(["party_member:pc", "npc:zoe", "faction:alp", "faction:zed"]);
    expect(ring1.find((n) => n.key === "npc:zoe")?.reasons).toEqual(["worships"]);
  });

  it("never makes a node its own neighbour", () => {
    const g = buildFocus(indexTies([tie({ row_id: "self", type: "friend", to_kind: "npc", to_id: "brenna", to_name: "Brenna Ashe" })]), "npc:brenna", 1, nameOf);
    expect(g.nodes).toEqual([{ key: "npc:brenna", ring: 0, reasons: [] }]);
  });

  it("keeps a first-ring node left out by the cap out of the second ring too", () => {
    // Names sort a..z, so the last ring-one node is the one the cap leaves out; the shown "m0" is tied to it.
    const crowd = Array.from({ length: RING_CAP.first + 1 }, (_, i) =>
      tie({ row_id: `c${i}`, source: "membership", type: "member_of", from_id: `m${i}`, from_name: `M${String(i).padStart(3, "0")}`, to_kind: "faction", to_id: "guild", to_name: "Guild" }),
    );
    const bridge = tie({ row_id: "bridge", type: "friend", from_id: "m0", from_name: "M000", to_kind: "npc", to_id: `m${RING_CAP.first}`, to_name: `M${String(RING_CAP.first).padStart(3, "0")}` });
    const g = buildFocus(indexTies([...crowd, bridge]), "faction:guild", 2, (k) => {
      const t = [...crowd, bridge].find((x) => `${x.from_kind}:${x.from_id}` === k);
      return t?.from_name ?? k;
    });
    expect(g.hidden.first).toBe(1);
    expect(g.nodes.some((n) => n.ring === 2)).toBe(false);
  });

  it("caps the second ring and counts what it leaves out", () => {
    const extra = 3;
    const spokes = Array.from({ length: RING_CAP.second + extra }, (_, i) =>
      tie({ row_id: `s${i}`, type: "friend", from_id: "hub", from_name: "Hub", to_kind: "npc", to_id: `far${i}`, to_name: `Far${String(i).padStart(3, "0")}` }),
    );
    const link = tie({ row_id: "x", type: "friend", from_id: "centre", from_name: "Centre", to_kind: "npc", to_id: "hub", to_name: "Hub" });
    const g = buildFocus(indexTies([link, ...spokes]), "npc:centre", 2, (k) => k);
    expect(g.nodes.filter((n) => n.ring === 2)).toHaveLength(RING_CAP.second);
    expect(g.hidden.second).toBe(extra);
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

  it("gives ring-one neighbours room along the circle however many there are", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      tie({ row_id: `n${i}`, type: "friend", from_id: `f${i}`, from_name: `F${i}`, to_kind: "npc", to_id: "me", to_name: "Me" }),
    );
    const placed = layoutRings(buildFocus(indexTies(many), "npc:me", 1, (k) => k)).filter((p) => p.ring === 1);
    expect(placed).toHaveLength(30);
    let nearest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) nearest = Math.min(nearest, Math.hypot(placed[i].x - placed[j].x, placed[i].y - placed[j].y));
    }
    expect(nearest).toBeGreaterThan(80); // a node and its label need about this much along the ring
  });

  it("puts the second ring outside the first", () => {
    const placed = layoutRings(buildFocus(index, "deity:lady", 2, nameOf));
    const r1 = Math.hypot(...Object.values(placed.find((p) => p.ring === 1)!).slice(1, 3) as [number, number]);
    const second = placed.find((p) => p.ring === 2)!;
    expect(Math.hypot(second.x, second.y)).toBeGreaterThan(r1);
  });
});
