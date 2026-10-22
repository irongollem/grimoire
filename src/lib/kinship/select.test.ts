import { describe, expect, it } from "vitest";
import { buildKinGraph, type KinEdgeInput, type KinPerson } from "@/lib/kinship/graph";
import { selectAroundFocus } from "@/lib/kinship/select";
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

describe("selectAroundFocus", () => {
  const g = buildKinGraph(thanePeople, thaneLinks);

  it("keeps the centred line and folds a sibling's children", () => {
    const sel = selectAroundFocus(g, k("brenna"));
    for (const n of ["aldous", "hesta", "bren", "maera", "odile", "garrick", "fenn", "tomas", "ilse", "corwin", "wren", "pip"]) {
      expect(sel.members.has(k(n)), n).toBe(true);
    }
    expect(sel.members.has(k("t1"))).toBe(false);
    expect([...(sel.folds.get(k("tomas")) ?? [])].sort()).toEqual([k("t1"), k("t2"), k("t3")]);
    expect(sel.folds.size).toBe(1);
  });

  it("opens a fold when its parent is expanded", () => {
    const sel = selectAroundFocus(g, k("brenna"), { expanded: new Set([k("tomas")]) });
    expect(sel.members.has(k("t1"))).toBe(true);
    expect(sel.folds.size).toBe(0);
  });

  it("limits ancestors by `up`", () => {
    const sel = selectAroundFocus(g, k("brenna"), { up: 1 });
    expect(sel.members.has(k("bren"))).toBe(true);
    expect(sel.members.has(k("aldous"))).toBe(false);
    expect(sel.members.has(k("odile"))).toBe(false);
  });

  it("returns nothing for an unknown focus", () => {
    expect(selectAroundFocus(g, "npc:nobody").members.size).toBe(0);
  });

  it("terminates on a loop", () => {
    const loop = buildKinGraph(thanePeople, [...thaneLinks, l("wren", "aldous", "parent"), l("pip", "wren", "parent")]);
    const sel = selectAroundFocus(loop, k("brenna"), { up: 6, down: 6 });
    expect(sel.members.has(k("brenna"))).toBe(true);
  });
});
