import { describe, expect, it } from "vitest";
import {
  buildKinGraph,
  childrenOf,
  familyOf,
  type KinEdgeInput,
  type KinPerson,
  linkBetween,
  parentsOf,
  relationTo,
  siblingsOf,
  spousesOf,
} from "@/lib/kinship/graph";
import type { KinKind, ParentRole, PersonKey } from "@/types/kinship.types";

const npc = (n: string): PersonKey => `npc:${n}`;
const person = (n: string, bornYear: number | null, name = n): KinPerson => ({
  key: npc(n),
  name,
  bornYear,
  diedYear: null,
  dead: false,
  isPc: false,
});
let seq = 0;
const link = (
  from: string,
  to: string,
  kind: KinKind,
  extra: { role?: ParentRole | null; adoptive?: boolean } = {},
): KinEdgeInput => ({
  id: `l${seq++}`,
  from: npc(from),
  to: npc(to),
  kind,
  parent_role: extra.role ?? null,
  adoptive: extra.adoptive ?? false,
});

const people = [person("a", 1000), person("b", 1002), person("c", 1030), person("d", 1033), person("e", null), person("f", 1031)];
const links = [
  link("a", "c", "parent", { role: "father" }),
  link("b", "c", "parent", { role: "mother" }),
  link("a", "d", "parent"),
  link("c", "e", "parent"),
  link("c", "f", "sibling"),
  link("a", "b", "spouse"),
  link("d", "x", "spouse"), // x is not a person: dropped
  link("c", "c", "relative"), // self: dropped
];

describe("buildKinGraph", () => {
  const g = buildKinGraph(people, links);

  it("keeps only links between known people", () => {
    expect(g.links).toHaveLength(6);
    expect(g.links.every((l) => g.people.has(l.from) && g.people.has(l.to))).toBe(true);
  });

  it("answers parents, children and spouses from both ends", () => {
    expect(parentsOf(g, npc("c")).map((p) => p.key)).toEqual([npc("a"), npc("b")]);
    expect(childrenOf(g, npc("a")).map((p) => p.key)).toEqual([npc("c"), npc("d")]);
    expect(spousesOf(g, npc("b"))).toMatchObject([{ key: npc("a"), former: false }]);
  });

  it("derives siblings from a shared parent and lets a stored link win", () => {
    const sibs = siblingsOf(g, npc("c"));
    expect(sibs.find((s) => s.key === npc("d"))).toMatchObject({ derived: true, link: null });
    expect(sibs.find((s) => s.key === npc("f"))).toMatchObject({ derived: false });
    expect(sibs.some((s) => s.key === npc("c"))).toBe(false);
    const withBoth = buildKinGraph(people, [...links, link("c", "d", "sibling")]);
    const d = siblingsOf(withBoth, npc("c")).filter((s) => s.key === npc("d"));
    expect(d).toHaveLength(1);
    expect(d[0]?.derived).toBe(false);
  });

  it("reads a link from either end", () => {
    const parent = links[0] as KinEdgeInput;
    expect(relationTo(parent, npc("c"))).toBe("parent");
    expect(relationTo(parent, npc("a"))).toBe("child");
    expect(relationTo(links[5] as KinEdgeInput, npc("a"))).toBe("spouse");
  });

  it("sorts a family by birth year, unknown last", () => {
    const fam = familyOf(g, npc("a"));
    expect(fam.children.map((c) => c.key)).toEqual([npc("c"), npc("d")]);
    expect(familyOf(g, npc("c")).children.map((c) => c.key)).toEqual([npc("e")]);
    const kids = buildKinGraph(people, [link("a", "e", "parent"), link("a", "d", "parent"), link("a", "c", "parent")]);
    expect(familyOf(kids, npc("a")).children.map((c) => c.key)).toEqual([npc("c"), npc("d"), npc("e")]);
  });

  it("finds the link between two people in either order", () => {
    expect(linkBetween(g, npc("b"), npc("c"))?.kind).toBe("parent");
    expect(linkBetween(g, npc("c"), npc("b"))?.kind).toBe("parent");
    expect(linkBetween(g, npc("e"), npc("f"))).toBeNull();
  });
});
