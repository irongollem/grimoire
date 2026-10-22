import { childrenOf, comparePeople, type KinGraph, parentsOf, spousesOf } from "@/lib/kinship/graph";
import type { PersonKey } from "@/types/kinship.types";

export interface LayoutInput {
  graph: KinGraph;
  members: Set<PersonKey>;
  folds: Map<PersonKey, PersonKey[]>;
  anchor?: PersonKey;
}

export interface PlacedCard {
  /** The person key, or `fold:<parentKey>` for a count card. */
  id: string;
  person: PersonKey | null;
  foldOf: PersonKey | null;
  foldCount: number;
  row: number;
  /** Left edge, in card units. */
  x: number;
}
export interface MarriageBar {
  a: PersonKey;
  b: PersonKey;
  former: boolean;
  row: number;
  /** The gap between the two cards. */
  x1: number;
  x2: number;
}
export interface DescentGroup {
  /** The parents' row. */
  row: number;
  anchorX: number;
  /** x is a card centre. */
  children: { id: string; x: number; adoptive: boolean }[];
}
export interface TreeLayout {
  cards: PlacedCard[];
  marriages: MarriageBar[];
  descents: DescentGroup[];
  rows: number;
  width: number;
  rowBornYear: (number | null)[];
}

export const CARD_W = 1;
export const GAP = 0.16;
export const COUPLE_GAP = 0.16;
const COMPONENT_GAP = 0.5;
const PASSES = 8;
const EPS = 1e-9;
const NO_GROUP = Number.MAX_SAFE_INTEGER;

interface Cell {
  id: string;
  person: PersonKey | null;
  foldOf: PersonKey | null;
  foldCount: number;
  row: number;
  unit: number;
  x: number;
}
interface Unit {
  id: number;
  row: number;
  people: PersonKey[];
  /** The parent a count card hangs from. */
  fold: PersonKey | null;
  cells: Cell[];
}

function foldId(parent: PersonKey): string {
  return `fold:${parent}`;
}

/** Cards on one row, in order; partners of a couple sit a COUPLE_GAP apart, other neighbours a GAP. */
function sweep(cells: Cell[]): void {
  for (let i = 1; i < cells.length; i++) {
    const prev = cells[i - 1];
    const cur = cells[i];
    if (!prev || !cur) continue;
    const min = prev.x + CARD_W + (prev.unit === cur.unit ? COUPLE_GAP : GAP);
    if (cur.x < min) cur.x = min;
  }
}

export function layoutTree(input: LayoutInput): TreeLayout {
  const { graph, folds } = input;
  const people = [...input.members].filter((k) => graph.people.has(k));
  const memberSet = new Set(people);
  const empty: TreeLayout = { cards: [], marriages: [], descents: [], rows: 0, width: 0, rowBornYear: [] };
  if (people.length === 0) return empty;

  const person = (k: PersonKey) => graph.people.get(k);
  const cmp = (a: PersonKey, b: PersonKey): number => comparePeople(graph, a, b);
  const sorted = [...people].sort(cmp);

  // 1. Rows: breadth first from the anchor; a child is one row below its parent, a spouse on the same row.
  const row = new Map<PersonKey, number>();
  const comp = new Map<PersonKey, number>();
  const starts: PersonKey[] = input.anchor && memberSet.has(input.anchor) ? [input.anchor, ...sorted] : sorted;
  let compCount = 0;
  for (const start of starts) {
    if (row.has(start)) continue;
    row.set(start, 0);
    comp.set(start, compCount);
    const queue: PersonKey[] = [start];
    for (let i = 0; i < queue.length; i++) {
      const k = queue[i];
      if (k === undefined) break;
      const r = row.get(k) ?? 0;
      const reach = (other: PersonKey, rr: number): void => {
        if (!memberSet.has(other) || row.has(other)) return;
        row.set(other, rr);
        comp.set(other, compCount);
        queue.push(other);
      };
      for (const p of parentsOf(graph, k)) reach(p.key, r - 1);
      for (const c of childrenOf(graph, k)) reach(c.key, r + 1);
      for (const s of spousesOf(graph, k)) reach(s.key, r);
    }
    compCount++;
  }
  let minRow = 0;
  for (const r of row.values()) minRow = Math.min(minRow, r);
  for (const [k, r] of row) row.set(k, r - minRow);
  const rowOf = (k: PersonKey): number => row.get(k) ?? 0;

  // Count cards: only for members that have hidden children.
  const foldCounts = new Map<PersonKey, number>();
  for (const [parent, kids] of folds) {
    if (!memberSet.has(parent)) continue;
    const n = new Set(kids.filter((k) => !memberSet.has(k))).size;
    if (n > 0) foldCounts.set(parent, n);
  }

  // Couples: spouses, and co-parents of a shared child, on one row.
  const couple = new Map<PersonKey, Set<PersonKey>>();
  const join = (a: PersonKey, b: PersonKey): void => {
    if (a === b || rowOf(a) !== rowOf(b)) return;
    if (!couple.has(a)) couple.set(a, new Set());
    if (!couple.has(b)) couple.set(b, new Set());
    couple.get(a)?.add(b);
    couple.get(b)?.add(a);
  };
  for (const link of graph.links) {
    if ((link.kind === "spouse" || link.kind === "former_spouse") && memberSet.has(link.from) && memberSet.has(link.to)) {
      join(link.from, link.to);
    }
  }
  const parentsInTree = (k: PersonKey): PersonKey[] =>
    parentsOf(graph, k)
      .map((p) => p.key)
      .filter((p) => memberSet.has(p) && rowOf(p) === rowOf(k) - 1);
  for (const k of people) {
    const ps = parentsInTree(k).sort(cmp);
    for (let i = 1; i < ps.length; i++) {
      const a = ps[i - 1];
      const b = ps[i];
      if (a !== undefined && b !== undefined) join(a, b);
    }
  }

  const cellOf = new Map<string, Cell>();
  const allCells: Cell[] = [];
  let unitSeq = 0;
  const unitOfPerson = new Map<PersonKey, Unit>();

  // 2-3. Units and their order, row by row from the top, per component.
  const compOrder: number[] = [];
  for (let c = 0; c < compCount; c++) compOrder.push(c);
  const rowsInComp = new Map<number, Set<number>>();
  for (const k of people) {
    const c = comp.get(k) ?? 0;
    if (!rowsInComp.has(c)) rowsInComp.set(c, new Set());
    rowsInComp.get(c)?.add(rowOf(k));
    if (foldCounts.has(k)) rowsInComp.get(c)?.add(rowOf(k) + 1);
  }

  const orderedUnits = new Map<number, Unit[]>(); // component -> all its units
  const posOfUnit = new Map<Unit, number>();

  for (const c of compOrder) {
    const rows = [...(rowsInComp.get(c) ?? [])].sort((a, b) => a - b);
    const compUnits: Unit[] = [];
    for (const r of rows) {
      const here = people.filter((k) => comp.get(k) === c && rowOf(k) === r);
      const seen = new Set<PersonKey>();
      const units: Unit[] = [];
      const hasParents = (k: PersonKey) => parentsInTree(k).length > 0;
      for (const k of [...here].sort(cmp)) {
        if (seen.has(k)) continue;
        // Gather the couple group, then walk it as a path so a person with two spouses sits between them.
        const group: PersonKey[] = [];
        const stack: PersonKey[] = [k];
        seen.add(k);
        while (stack.length > 0) {
          const n = stack.pop();
          if (n === undefined) break;
          group.push(n);
          for (const o of couple.get(n) ?? []) {
            if (!seen.has(o)) {
              seen.add(o);
              stack.push(o);
            }
          }
        }
        const degree = (n: PersonKey) => couple.get(n)?.size ?? 0;
        const ends = group.filter((n) => degree(n) <= 1);
        const startPool = ends.length > 0 ? ends : group;
        // The partner with parents in the tree comes first, so the one who married in sits on the right.
        const start = [...startPool].sort((a, b) => Number(hasParents(b)) - Number(hasParents(a)) || cmp(a, b))[0] ?? k;
        const walk: PersonKey[] = [];
        const visited = new Set<PersonKey>();
        const visit = (n: PersonKey): void => {
          visited.add(n);
          walk.push(n);
          for (const o of [...(couple.get(n) ?? [])].sort(cmp)) if (!visited.has(o)) visit(o);
        };
        visit(start);
        units.push({ id: unitSeq++, row: r, people: walk, fold: null, cells: [] });
      }
      for (const [parent] of foldCounts) {
        if (comp.get(parent) === c && rowOf(parent) + 1 === r) {
          units.push({ id: unitSeq++, row: r, people: [], fold: parent, cells: [] });
        }
      }
      // Sort key: the parent unit's place in the row above, count cards last, then birth order.
      const keyOf = (u: Unit): { group: number; fold: number; lead: PersonKey } => {
        if (u.fold !== null) {
          const pu = unitOfPerson.get(u.fold);
          return { group: pu ? (posOfUnit.get(pu) ?? NO_GROUP) : NO_GROUP, fold: 1, lead: u.fold };
        }
        let best = NO_GROUP;
        let lead: PersonKey | null = null;
        for (const p of [...u.people].sort(cmp)) {
          for (const par of parentsInTree(p)) {
            const pu = unitOfPerson.get(par);
            const pos = pu ? (posOfUnit.get(pu) ?? NO_GROUP) : NO_GROUP;
            if (pos < best) {
              best = pos;
              lead = p;
            }
          }
        }
        return { group: best, fold: 0, lead: lead ?? [...u.people].sort(cmp)[0] ?? "npc:" };
      };
      const keyed = units.map((u) => ({ u, key: keyOf(u) }));
      keyed.sort((a, b) => a.key.group - b.key.group || a.key.fold - b.key.fold || cmp(a.key.lead, b.key.lead));
      keyed.forEach(({ u }, i) => {
        posOfUnit.set(u, i);
        for (const p of u.people) unitOfPerson.set(p, u);
        compUnits.push(u);
      });
    }
    orderedUnits.set(c, compUnits);
  }

  // 4. Cells and x.
  const cellsByRow = new Map<number, Cell[]>();
  const placeComponent = (c: number): { cells: Cell[]; width: number } => {
    const units = orderedUnits.get(c) ?? [];
    const byRow = new Map<number, Cell[]>();
    for (const u of units) {
      const ids: { id: string; person: PersonKey | null }[] =
        u.fold !== null ? [{ id: foldId(u.fold), person: null }] : u.people.map((p) => ({ id: p, person: p }));
      for (const { id, person: pk } of ids) {
        const cell: Cell = {
          id,
          person: pk,
          foldOf: u.fold,
          foldCount: u.fold !== null ? (foldCounts.get(u.fold) ?? 0) : 0,
          row: u.row,
          unit: u.id,
          x: 0,
        };
        u.cells.push(cell);
        cellOf.set(id, cell);
        allCells.push(cell);
        const list = byRow.get(u.row) ?? [];
        list.push(cell);
        byRow.set(u.row, list);
      }
    }
    for (const list of byRow.values()) sweep(list);
    const rowNumbers = [...byRow.keys()].sort((a, b) => a - b);

    const childCells = (u: Unit): Cell[] => {
      const out = new Set<Cell>();
      for (const p of u.people) {
        for (const ch of childrenOf(graph, p)) {
          const cell = cellOf.get(ch.key);
          if (cell && cell.row === u.row + 1) out.add(cell);
        }
        const fold = cellOf.get(foldId(p));
        if (fold) out.add(fold);
      }
      return [...out];
    };
    const unitById = new Map<number, Unit>(units.map((u) => [u.id, u]));
    const shiftFrom = (fromRow: number, threshold: number, by: number): void => {
      for (const r of rowNumbers) {
        if (r < fromRow) continue;
        for (const cell of byRow.get(r) ?? []) if (cell.x >= threshold - EPS) cell.x += by;
      }
    };

    for (let pass = 0; pass < PASSES; pass++) {
      let moved = false;
      for (let ri = rowNumbers.length - 1; ri >= 0; ri--) {
        const r = rowNumbers[ri];
        if (r === undefined) continue;
        for (const u of units.filter((x) => x.row === r)) {
          const kids = childCells(u);
          const first = u.cells[0];
          const last = u.cells[u.cells.length - 1];
          if (kids.length === 0 || !first || !last) continue;
          const xs = kids.map((k) => k.x);
          const target = (Math.min(...xs) + Math.max(...xs) + CARD_W) / 2;
          const delta = target - (first.x + last.x + CARD_W) / 2;
          if (Math.abs(delta) < EPS) continue;
          moved = true;
          if (delta > 0) {
            for (const cell of u.cells) cell.x += delta;
            sweep(byRow.get(r) ?? []);
          } else {
            const left = Math.min(...kids.map((k) => unitById.get(k.unit)?.cells[0]?.x ?? k.x));
            shiftFrom(r + 1, left, -delta);
          }
        }
      }
      for (const list of byRow.values()) sweep(list);
      if (!moved) break;
    }

    let minX = Number.POSITIVE_INFINITY;
    let maxX = 0;
    const cells = [...byRow.values()].flat();
    for (const cell of cells) minX = Math.min(minX, cell.x);
    for (const cell of cells) {
      cell.x -= minX;
      maxX = Math.max(maxX, cell.x + CARD_W);
    }
    return { cells, width: maxX };
  };

  let offset = 0;
  for (const c of compOrder) {
    const placed = placeComponent(c);
    for (const cell of placed.cells) {
      cell.x += offset;
      const list = cellsByRow.get(cell.row) ?? [];
      list.push(cell);
      cellsByRow.set(cell.row, list);
    }
    offset += placed.width + COMPONENT_GAP;
  }

  let rowCount = 0;
  let width = 0;
  for (const cell of allCells) {
    rowCount = Math.max(rowCount, cell.row + 1);
    width = Math.max(width, cell.x + CARD_W);
  }

  // 5. Marriage bars and descent lines.
  const marriages: MarriageBar[] = [];
  for (const link of graph.links) {
    if (link.kind !== "spouse" && link.kind !== "former_spouse") continue;
    const ca = cellOf.get(link.from);
    const cb = cellOf.get(link.to);
    if (!ca || !cb || ca.row !== cb.row) continue;
    const [l, r] = ca.x <= cb.x ? [ca, cb] : [cb, ca];
    marriages.push({
      a: link.from,
      b: link.to,
      former: link.kind === "former_spouse",
      row: ca.row,
      x1: l.x + CARD_W,
      x2: r.x,
    });
  }

  const groups = new Map<string, { row: number; parents: Cell[]; children: DescentGroup["children"] }>();
  const addToGroup = (parentKeys: PersonKey[], child: Cell, adoptive: boolean): void => {
    const parents = parentKeys.map((p) => cellOf.get(p)).filter((x): x is Cell => x !== undefined);
    const first = parents[0];
    if (!first) return;
    const key = [...parentKeys].sort().join("|");
    const group = groups.get(key) ?? { row: first.row, parents, children: [] };
    group.children.push({ id: child.id, x: child.x + CARD_W / 2, adoptive });
    groups.set(key, group);
  };
  for (const k of people) {
    const cell = cellOf.get(k);
    if (!cell) continue;
    const ps = parentsInTree(k);
    if (ps.length === 0) continue;
    const adoptive = parentsOf(graph, k).some((p) => ps.includes(p.key) && p.link.adoptive);
    addToGroup(ps, cell, adoptive);
  }
  for (const [parent] of foldCounts) {
    const fold = cellOf.get(foldId(parent));
    if (!fold) continue;
    const unit = unitOfPerson.get(parent);
    const together = unit && unit.people.length === 2 ? unit.people : [parent];
    addToGroup(together, fold, false);
  }
  const descents: DescentGroup[] = [...groups.values()].map((g) => {
    const centres = g.parents.map((p) => p.x + CARD_W / 2);
    return { row: g.row, anchorX: (Math.min(...centres) + Math.max(...centres)) / 2, children: g.children };
  });
  descents.sort((a, b) => a.row - b.row || a.anchorX - b.anchorX);

  // 6. Median known birth year per row.
  const rowBornYear: (number | null)[] = [];
  for (let r = 0; r < rowCount; r++) {
    const years: number[] = [];
    for (const cell of cellsByRow.get(r) ?? []) {
      const y = cell.person ? (person(cell.person)?.bornYear ?? null) : null;
      if (y !== null) years.push(y);
    }
    years.sort((a, b) => a - b);
    const mid = years.length >> 1;
    const lo = years[mid - 1];
    const hi = years[mid];
    if (hi === undefined) rowBornYear.push(null);
    else if (years.length % 2 === 1 || lo === undefined) rowBornYear.push(hi);
    else rowBornYear.push(Math.round((lo + hi) / 2));
  }

  return {
    cards: allCells.map((c) => ({
      id: c.id,
      person: c.person,
      foldOf: c.foldOf,
      foldCount: c.foldCount,
      row: c.row,
      x: c.x,
    })),
    marriages,
    descents,
    rows: rowCount,
    width,
    rowBornYear,
  };
}
