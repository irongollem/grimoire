import { describe, expect, it } from "vitest";
import { buildKinGraph, type KinEdgeInput, type KinPerson } from "@/lib/kinship/graph";
import { CARD_W, COUPLE_GAP, GAP, layoutTree, type TreeLayout } from "@/lib/kinship/layout";
import { selectAroundFocus } from "@/lib/kinship/select";
import type { KinKind, ParentRole, PersonKey } from "@/types/kinship.types";

const k = (n: string): PersonKey => (n === "ilse" ? "pc:ilse" : `npc:${n}`);
const born: Record<string, number> = {
  aldous: 1000, hesta: 1002, bren: 1030, odile: 1033, maera: 1032, garrick: 1031, fenn: 1060,
  brenna: 1055, tomas: 1058, ilse: 1061, corwin: 1054, wren: 1080, pip: 1083, t1: 1085, t2: 1087, t3: 1090,
};
const thanePeople: KinPerson[] = Object.entries(born).map(([n, y]) => ({
  key: k(n), name: n, bornYear: y, diedYear: null, dead: false, isPc: n === "ilse",
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


const thane = buildKinGraph(thanePeople, thaneLinks);
const MIN_GAP = Math.min(GAP, COUPLE_GAP);

/** The invariant the drawing relies on: on every row, cards never touch. */
function expectNoOverlap(layout: TreeLayout, expectedIds?: string[]): void {
  const byRow = new Map<number, number[]>();
  for (const c of layout.cards) {
    expect(c.x).toBeGreaterThanOrEqual(-1e-9);
    byRow.set(c.row, [...(byRow.get(c.row) ?? []), c.x]);
  }
  for (const xs of byRow.values()) {
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) {
      expect((xs[i] as number) - (xs[i - 1] as number)).toBeGreaterThanOrEqual(CARD_W + MIN_GAP - 1e-9);
    }
  }
  if (expectedIds) expect(layout.cards.map((c) => c.id).sort()).toEqual([...expectedIds].sort());
  expect(new Set(layout.cards.map((c) => c.id)).size).toBe(layout.cards.length);
}

describe("layoutTree on the Thane family", () => {
  const sel = selectAroundFocus(thane, k("brenna"));
  const layout = layoutTree({ graph: thane, members: sel.members, folds: sel.folds, anchor: k("brenna") });
  const card = (id: string) => layout.cards.find((c) => c.id === id);
  const rowOf = (n: string) => card(k(n))?.row;

  it("puts generations on rows and never overlaps", () => {
    expectNoOverlap(layout, [...sel.members, "fold:npc:tomas"]);
    expect(rowOf("aldous")).toBe(0);
    expect(rowOf("hesta")).toBe(0);
    expect(rowOf("bren")).toBe(1);
    expect(rowOf("odile")).toBe(1);
    expect(rowOf("brenna")).toBe(2);
    expect(rowOf("fenn")).toBe(2);
    expect(rowOf("wren")).toBe(3);
    expect(layout.rows).toBe(4);
    expect(layout.rowBornYear[0]).toBe(1001);
    expect(layout.rowBornYear).toHaveLength(4);
  });

  it("seats couples side by side with the married-in partner on the right", () => {
    const x = (n: string) => card(k(n))?.x ?? Number.NaN;
    expect(x("maera")).toBeGreaterThan(x("bren"));
    expect(x("maera") - x("bren")).toBeCloseTo(CARD_W + COUPLE_GAP);
    expect(x("corwin")).toBeGreaterThan(x("brenna"));
    expect(x("hesta")).toBeGreaterThan(x("aldous"));
  });

  it("draws a bar between spouses, dashed for a former one", () => {
    const bar = layout.marriages.find((m) => m.a === k("odile"));
    expect(bar?.former).toBe(true);
    const maera = layout.marriages.find((m) => m.b === k("maera"));
    expect(maera?.former).toBe(false);
    expect(maera?.x2 ?? 0).toBeGreaterThan(maera?.x1 ?? 0);
    expect(layout.marriages).toHaveLength(4);
  });

  it("hangs the children under the midpoint of their parents", () => {
    const x = (n: string) => (card(k(n))?.x ?? 0) + CARD_W / 2;
    const kids = layout.descents.find((d) => d.children.some((c) => c.id === k("wren")));
    expect(kids?.anchorX).toBeCloseTo((x("brenna") + x("corwin")) / 2);
    expect(kids?.children.map((c) => c.id).sort()).toEqual([k("pip"), k("wren")].sort());
    const bren = layout.descents.find((d) => d.children.some((c) => c.id === k("brenna")));
    expect(bren?.anchorX).toBeCloseTo((x("bren") + x("maera")) / 2);
  });

  it("marks an adoptive child", () => {
    const d = layout.descents.find((g) => g.children.some((c) => c.id === k("fenn")));
    expect(d?.children.find((c) => c.id === k("fenn"))?.adoptive).toBe(true);
    expect(d?.anchorX).toBeCloseTo((card(k("odile"))?.x ?? 0) + CARD_W / 2);
  });

  it("places the count card for Tomas's children one row down, in his group", () => {
    const fold = card("fold:npc:tomas");
    expect(fold).toMatchObject({ person: null, foldOf: k("tomas"), foldCount: 3, row: 3 });
    const d = layout.descents.find((g) => g.children.some((c) => c.id === "fold:npc:tomas"));
    expect(d?.row).toBe(2);
  });

  it("is deterministic", () => {
    const again = layoutTree({ graph: thane, members: sel.members, folds: sel.folds, anchor: k("brenna") });
    expect(again).toEqual(layout);
  });
});

describe("layoutTree edge cases", () => {
  it("handles an empty selection", () => {
    expect(layoutTree({ graph: thane, members: new Set(), folds: new Map() })).toMatchObject({ cards: [], rows: 0, width: 0 });
  });

  it("lays out separate families side by side", () => {
    const layout = layoutTree({ graph: thane, members: new Set([k("aldous"), k("hesta"), k("corwin"), k("t1")]), folds: new Map() });
    expectNoOverlap(layout, ["npc:aldous", "npc:hesta", "npc:corwin", "npc:t1"]);
  });

  it("keeps a remarried person between both spouses", () => {
    const members = new Set([k("odile"), k("garrick"), k("corwin"), k("fenn")]);
    const extra = buildKinGraph(thanePeople, [...thaneLinks, { id: "re", from: k("odile"), to: k("corwin"), kind: "spouse", parent_role: null, adoptive: false }]);
    const layout = layoutTree({ graph: extra, members, folds: new Map() });
    expectNoOverlap(layout);
    const x = (n: string) => layout.cards.find((c) => c.id === k(n))?.x ?? 0;
    expect(Math.abs(x("odile") - x("garrick"))).toBeLessThan(2);
    expect(Math.abs(x("odile") - x("corwin"))).toBeLessThan(2);
    expect((x("odile") - x("garrick")) * (x("odile") - x("corwin"))).toBeLessThan(0);
  });

  it("keeps a child with one parent in the selection", () => {
    const layout = layoutTree({ graph: thane, members: new Set([k("bren"), k("brenna")]), folds: new Map() });
    expectNoOverlap(layout, [k("bren"), k("brenna")]);
    expect(layout.descents).toHaveLength(1);
  });

  it("widens for thirty siblings without overlap", () => {
    const people: KinPerson[] = [{ key: "npc:mum", name: "mum", bornYear: 1000, diedYear: null, dead: false, isPc: false }];
    const links: KinEdgeInput[] = [];
    for (let i = 0; i < 30; i++) {
      people.push({ key: `npc:c${i}`, name: `c${i}`, bornYear: 1030 + (i % 7), diedYear: null, dead: false, isPc: false });
      links.push({ id: `p${i}`, from: "npc:mum", to: `npc:c${i}`, kind: "parent", parent_role: null, adoptive: false });
    }
    const layout = layoutTree({ graph: buildKinGraph(people, links), members: new Set(people.map((p) => p.key)), folds: new Map() });
    expectNoOverlap(layout);
    expect(layout.width).toBeGreaterThanOrEqual(30 * CARD_W + 29 * MIN_GAP - 1e-9);
    const mum = layout.cards.find((c) => c.id === "npc:mum");
    expect((mum?.x ?? 0) + CARD_W / 2).toBeCloseTo(layout.width / 2, 1);
  });

  it("terminates on parent loops and spouse cycles", () => {
    const ps: KinPerson[] = ["a", "b", "c"].map((n) => ({ key: `npc:${n}`, name: n, bornYear: null, diedYear: null, dead: false, isPc: false }));
    const e = (id: string, from: string, to: string, kind: KinKind): KinEdgeInput => ({ id, from: `npc:${from}`, to: `npc:${to}`, kind, parent_role: null, adoptive: false });
    const g = buildKinGraph(ps, [e("1", "a", "b", "parent"), e("2", "b", "c", "parent"), e("3", "c", "a", "parent"), e("4", "a", "c", "spouse"), e("5", "b", "a", "spouse")]);
    const layout = layoutTree({ graph: g, members: new Set(ps.map((p) => p.key)), folds: new Map() });
    expectNoOverlap(layout, ps.map((p) => p.key));
  });
});

/** Small seeded generator so the property run is the same everywhere. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("layoutTree property: cards never overlap", () => {
  it("holds over 200 random families", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rand = rng(seed);
      const pick = (n: number) => Math.floor(rand() * n);
      const count = 2 + pick(40);
      const people: KinPerson[] = [];
      for (let i = 0; i < count; i++) {
        people.push({ key: `npc:p${i}`, name: `p${pick(9)}`, bornYear: rand() < 0.2 ? null : 1000 + pick(120), diedYear: null, dead: false, isPc: false });
      }
      const links: KinEdgeInput[] = [];
      const kinds: KinKind[] = ["parent", "parent", "parent", "spouse", "former_spouse", "sibling", "relative"];
      const linkCount = pick(count * 2) + 1;
      for (let i = 0; i < linkCount; i++) {
        const a = pick(count);
        // Mostly forward in index so the family is a sensible forest; a few arbitrary links make loops.
        const b = rand() < 0.1 ? pick(count) : Math.min(count - 1, a + 1 + pick(6));
        links.push({ id: `r${i}`, from: `npc:p${a}`, to: `npc:p${b}`, kind: kinds[pick(kinds.length)] as KinKind, parent_role: null, adoptive: rand() < 0.2 });
      }
      const g = buildKinGraph(people, links);
      const all = people.map((p) => p.key);
      const members = new Set(all.filter(() => rand() < 0.85));
      const folds = new Map<PersonKey, PersonKey[]>();
      for (const m of members) if (rand() < 0.15) folds.set(m, all.filter((k2) => !members.has(k2)).slice(0, 3));
      const anchor = rand() < 0.5 ? (all[pick(count)] as PersonKey) : undefined;
      const layout = layoutTree({ graph: g, members, folds, anchor });
      expectNoOverlap(layout);
      const persons = layout.cards.filter((c) => c.person !== null).map((c) => c.person);
      expect(new Set(persons)).toEqual(members);
    }
  });
});
