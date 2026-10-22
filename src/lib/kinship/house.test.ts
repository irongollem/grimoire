import { describe, expect, it } from "vitest";
import { buildKinGraph, type KinEdgeInput, type KinPerson } from "@/lib/kinship/graph";
import { followsLine, houseLineage } from "@/lib/kinship/house";
import type { KinKind, ParentRole, PersonKey } from "@/types/kinship.types";

const k = (n: string): PersonKey => (n === "ilse" ? "pc:ilse" : `npc:${n}`);
const born: Record<string, number> = {
  aldous: 1000, hesta: 1002, bren: 1030, odile: 1033, maera: 1032, garrick: 1031, fenn: 1060,
  brenna: 1055, tomas: 1058, ilse: 1061, corwin: 1054, wren: 1080, pip: 1083, t1: 1085, t2: 1087, t3: 1090,
};
const thanePeople: KinPerson[] = Object.entries(born).map(([n, y]) => ({
  key: k(n), name: n, bornYear: y, dead: false, isPc: n === "ilse",
}));
let seq = 0;
const l = (from: string, to: string, kind: KinKind, role: ParentRole | null = null, adoptive = false): KinEdgeInput => ({
  id: `t${seq++}`, from: k(from), to: k(to), kind, parent_role: role, adoptive,
});
const thaneLinks: KinEdgeInput[] = [
  l("aldous", "hesta", "spouse"),
  l("aldous", "bren", "parent", "father"), l("hesta", "bren", "parent", "mother"),
  l("aldous", "odile", "parent", "father"), l("hesta", "odile", "parent", "mother"),
  l("bren", "maera", "spouse"),
  l("bren", "brenna", "parent", "father"), l("maera", "brenna", "parent", "mother"),
  l("bren", "tomas", "parent", "father"), l("maera", "tomas", "parent", "mother"),
  l("bren", "ilse", "parent", "father"), l("maera", "ilse", "parent", "mother"),
  l("odile", "garrick", "former_spouse"),
  l("odile", "fenn", "parent", "mother", true),
  l("brenna", "corwin", "spouse"),
  l("brenna", "wren", "parent", "mother"), l("corwin", "wren", "parent", "father"),
  l("brenna", "pip", "parent", "mother"), l("corwin", "pip", "parent", "father"),
  l("tomas", "t1", "parent", "father"), l("tomas", "t2", "parent", "father"), l("tomas", "t3", "parent", "father"),
];


describe("followsLine", () => {
  const link = (role: ParentRole | null) => ({ ...thaneLinks[1], parent_role: role }) as KinEdgeInput;
  it("reckons an unknown parent role to either line", () => {
    expect(followsLine(link(null), "father")).toBe(true);
    expect(followsLine(link(null), "mother")).toBe(true);
    expect(followsLine(link("mother"), "father")).toBe(false);
    expect(followsLine(link("father"), "mother")).toBe(false);
    expect(followsLine(link("mother"), "either")).toBe(true);
  });
});

describe("houseLineage", () => {
  const g = buildKinGraph(thanePeople, thaneLinks);
  const seeds = new Set<PersonKey>([k("aldous"), k("hesta"), k("bren"), k("maera")]);

  it("follows the father line, marries people in and folds children of the other line", () => {
    const h = houseLineage(g, seeds, "father");
    expect([...h.blood].sort()).toEqual(
      ["aldous", "hesta", "bren", "odile", "brenna", "tomas", "ilse", "t1", "t2", "t3"].map(k).sort(),
    );
    expect([...h.marriedIn].sort()).toEqual(["maera", "garrick", "corwin"].map(k).sort());
    expect(h.members.size).toBe(h.blood.size + h.marriedIn.size);
    expect(h.folds.get(k("brenna"))?.sort()).toEqual([k("pip"), k("wren")]);
    expect(h.folds.get(k("odile"))).toEqual([k("fenn")]);
    expect(h.members.has(k("wren"))).toBe(false);
  });

  it("takes every child under either", () => {
    const h = houseLineage(g, seeds, "either");
    expect(h.blood.has(k("wren"))).toBe(true);
    expect(h.blood.has(k("fenn"))).toBe(true);
    expect(h.folds.size).toBe(0);
  });

  it("follows the mother line", () => {
    const h = houseLineage(g, seeds, "mother");
    expect(h.blood.has(k("fenn"))).toBe(true);
    expect(h.blood.has(k("odile"))).toBe(true);
    expect(h.blood.has(k("brenna"))).toBe(false);
    expect(h.folds.get(k("bren"))?.length).toBe(3);
  });

  it("treats a founding couple as both blood", () => {
    const h = houseLineage(g, new Set([k("aldous"), k("hesta")]), "either");
    expect(h.marriedIn.has(k("hesta"))).toBe(false);
    expect(h.blood.has(k("hesta"))).toBe(true);
  });

  it("uses the member list as is under oath", () => {
    const h = houseLineage(g, new Set([k("bren"), k("tomas")]), "oath");
    expect([...h.blood].sort()).toEqual([k("bren"), k("tomas")].sort());
    expect([...h.marriedIn]).toEqual([k("maera")]);
    expect(h.folds.size).toBe(0);
  });

  it("ignores seeds that are not people", () => {
    expect(houseLineage(g, new Set<PersonKey>(["npc:ghost"]), "either").members.size).toBe(0);
  });
});
