/**
 * Focus (#1084): one node laid out in rings, with everything that touches it.
 *
 * At rest the web leaves the layout to a force simulation and draws only links
 * and kin. Focusing a node is the question "what is this tied to", so the answer
 * is laid out by hand: the centre, a ring of everything one step away with the
 * reason on each, and (on request) a second ring of what those are tied to.
 * Records count here: a deity's patron-of PCs, a guild's members and a place's
 * residents all draw, as dashed spokes. That is how "who worships her" gets an
 * answer, and it is why focus never runs on the whole web: the guild of
 * twenty-three is the subject only when the DM asks for it.
 */
import { parseNodeKey, type WebKind } from "./kinds";
import { fromKey, isLine, otherKey, tieFamily, tieWordFrom, toKey, type TieFamily, type WorldTie } from "./ties";

export type FocusSteps = 1 | 2;

/** More than this in a ring is a crowd, not a picture; the side panel still lists them all. */
export const RING_CAP = { first: 48, second: 72 } as const;

export interface FocusNode {
  key: string;
  ring: 0 | 1 | 2;
  /** What this node is to the centre, read from the node's own end: "worships", "patron deity". Ring one only. */
  reasons: string[];
}

export interface FocusEdge {
  key: string;
  source: string;
  target: string;
  family: TieFamily;
  /** A record draws dashed. */
  dashed: boolean;
  /** The second ring is faded. */
  faded: boolean;
  tie: WorldTie;
}

export interface FocusGraph {
  center: string;
  nodes: FocusNode[];
  edges: FocusEdge[];
  /** Ties past the ring caps, so the picture can say it is not the whole of it. */
  hidden: { first: number; second: number };
}

/** Every tie by the node keys at its ends: the index a focus walks. */
export function indexTies(ties: readonly WorldTie[]): Map<string, WorldTie[]> {
  const index = new Map<string, WorldTie[]>();
  const add = (key: string, tie: WorldTie) => {
    const list = index.get(key);
    if (list) list.push(tie);
    else index.set(key, [tie]);
  };
  for (const tie of ties) {
    const a = fromKey(tie);
    const b = toKey(tie);
    if (a === b) continue;
    add(a, tie);
    add(b, tie);
  }
  return index;
}

/** Sort that keeps a ring readable: people together, then by kind, then by name. */
const KIND_ORDER: readonly WebKind[] = ["party_member", "npc", "faction", "deity", "location", "item", "quest"];

export function buildFocus(
  index: ReadonlyMap<string, readonly WorldTie[]>,
  center: string,
  steps: FocusSteps,
  nameOf: (key: string) => string,
): FocusGraph {
  const order = (a: string, b: string) => {
    const ka = KIND_ORDER.indexOf(parseNodeKey(a)?.kind ?? "quest");
    const kb = KIND_ORDER.indexOf(parseNodeKey(b)?.kind ?? "quest");
    return ka - kb || nameOf(a).localeCompare(nameOf(b));
  };

  const first = new Map<string, WorldTie[]>();
  for (const tie of index.get(center) ?? []) {
    const other = otherKey(tie, center);
    const list = first.get(other);
    if (list) list.push(tie);
    else first.set(other, [tie]);
  }
  const firstKeys = [...first.keys()].sort(order);
  const shownFirst = firstKeys.slice(0, RING_CAP.first);
  const firstSet = new Set(shownFirst);

  const nodes: FocusNode[] = [{ key: center, ring: 0, reasons: [] }];
  const edges: FocusEdge[] = [];
  const edgeFor = (tie: WorldTie, faded: boolean): FocusEdge => ({
    key: `${tie.source}:${tie.row_id}:${tie.type}:${fromKey(tie)}>${toKey(tie)}`,
    source: fromKey(tie),
    target: toKey(tie),
    family: tieFamily(tie),
    dashed: !isLine(tie),
    faded,
    tie,
  });

  for (const key of shownFirst) {
    const ties = first.get(key) ?? [];
    nodes.push({ key, ring: 1, reasons: [...new Set(ties.map((t) => tieWordFrom(t, key)))] });
    for (const tie of ties) edges.push(edgeFor(tie, false));
  }

  let hiddenSecond = 0;
  if (steps === 2) {
    const second = new Map<string, WorldTie[]>();
    for (const key of shownFirst) {
      for (const tie of index.get(key) ?? []) {
        const other = otherKey(tie, key);
        if (other === center || firstSet.has(other) || first.has(other)) continue;
        const list = second.get(other);
        if (list) list.push(tie);
        else second.set(other, [tie]);
      }
    }
    const secondKeys = [...second.keys()].sort(order);
    hiddenSecond = Math.max(0, secondKeys.length - RING_CAP.second);
    for (const key of secondKeys.slice(0, RING_CAP.second)) {
      nodes.push({ key, ring: 2, reasons: [] });
      for (const tie of second.get(key) ?? []) edges.push(edgeFor(tie, true));
    }
  }

  return { center, nodes, edges, hidden: { first: firstKeys.length - shownFirst.length, second: hiddenSecond } };
}

export interface Placed {
  key: string;
  x: number;
  y: number;
  ring: 0 | 1 | 2;
}

/** Room one node and its label need along a ring, in layout units. */
const SLOT = 92;
const MIN_FIRST_RADIUS = 150;
const RING_GAP = 120;

/**
 * Concentric positions about the origin. The first ring is spread evenly; each
 * second-ring node is placed at the mean angle of the first-ring nodes it hangs
 * from, so a second-ring node stands behind the thing it belongs to, then nudged
 * apart so labels do not collide.
 */
export function layoutRings(graph: FocusGraph): Placed[] {
  const firsts = graph.nodes.filter((n) => n.ring === 1);
  const seconds = graph.nodes.filter((n) => n.ring === 2);
  const placed: Placed[] = [{ key: graph.center, x: 0, y: 0, ring: 0 }];

  const r1 = Math.max(MIN_FIRST_RADIUS, (firsts.length * SLOT) / (2 * Math.PI));
  const angleOf = new Map<string, number>();
  firsts.forEach((n, i) => {
    // Start at the top and go clockwise.
    const angle = -Math.PI / 2 + (i / Math.max(1, firsts.length)) * 2 * Math.PI;
    angleOf.set(n.key, angle);
    placed.push({ key: n.key, x: Math.cos(angle) * r1, y: Math.sin(angle) * r1, ring: 1 });
  });

  if (!seconds.length) return placed;

  const r2 = Math.max(r1 + RING_GAP, (seconds.length * SLOT * 0.8) / (2 * Math.PI));
  const wanted = new Map<string, number>();
  for (const n of seconds) {
    const angles: number[] = [];
    for (const edge of graph.edges) {
      const other = edge.source === n.key ? edge.target : edge.target === n.key ? edge.source : null;
      const a = other ? angleOf.get(other) : undefined;
      if (a !== undefined) angles.push(a);
    }
    // Mean of unit vectors, so angles either side of the seam average correctly.
    const x = angles.reduce((s, a) => s + Math.cos(a), 0);
    const y = angles.reduce((s, a) => s + Math.sin(a), 0);
    wanted.set(n.key, angles.length ? Math.atan2(y, x) : -Math.PI / 2);
  }
  const sorted = [...seconds].sort((a, b) => (wanted.get(a.key) ?? 0) - (wanted.get(b.key) ?? 0));
  const minGap = (2 * Math.PI) / Math.max(sorted.length, 1);
  // Relax: keep each at least one slot from its predecessor going round.
  const slotAngle = Math.min(minGap, (SLOT * 0.8) / r2);
  const angles = sorted.map((n) => wanted.get(n.key) ?? 0);
  for (let i = 1; i < angles.length; i++) {
    if (angles[i] - angles[i - 1] < slotAngle) angles[i] = angles[i - 1] + slotAngle;
  }
  sorted.forEach((n, i) => {
    placed.push({ key: n.key, x: Math.cos(angles[i]) * r2, y: Math.sin(angles[i]) * r2, ring: 2 });
  });
  return placed;
}
