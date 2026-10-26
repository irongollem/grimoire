/**
 * The World web at rest (#1084): which things are nodes, and which ties are lines.
 *
 * At rest the web draws links and kin. Everything else a tie can be (a
 * membership, a home, a patron deity, a pack, a seat, a store, a quest) is a
 * record, and records group instead of drawing: they would make hubs. So a
 * faction, place, deity, item or quest is a node only when it has a line, and a
 * person is always a node, because a person with no ties is still someone the
 * DM wants to find.
 */
import type { NpcRelationship } from "@/types/npc.types";
import { factionBadgesByNode, type NodeFactionBadges } from "./badges";
import { isPersonKind, nodeKey, type WebKind } from "./kinds";
import { fromKey, isLine, tieFamily, tieWord, toKey, type TieFamily, type WorldTie } from "./ties";

/** Anything the web can name: a row of `get_world_ties`, or a person the DM has with no ties. */
export interface WebEntity {
  key: string;
  kind: WebKind;
  id: string;
  name: string;
  image: string | null;
  /** NPCs only: their attitude to the party, which colours their node. */
  attitude: NpcRelationship | null;
}

export interface RestFilters {
  search: string;
  hiddenKinds: ReadonlySet<WebKind>;
  family: TieFamily | "";
  /** Node keys that must show whatever the filters say: the group being drawn, the node being connected. */
  pinned: ReadonlySet<string>;
}

export interface RestEdge {
  key: string;
  source: string;
  target: string;
  family: TieFamily;
  ties: WorldTie[];
  /** The primary tie read from `source`, with "+n" when more ties join the pair. */
  label: string;
  /** Parent lines point at the child. */
  arrow: boolean;
}

export interface RestGraph {
  nodes: Map<string, WebEntity>;
  edges: RestEdge[];
  /** Nodes per kind before the kind chips and the search narrow anything. */
  counts: Map<WebKind, number>;
}

export const EMPTY_FILTERS: RestFilters = { search: "", hiddenKinds: new Set(), family: "", pinned: new Set() };

/** Every named thing the ties mention, plus the people given. People win: they carry the attitude. */
export function entityDirectory(ties: readonly WorldTie[], people: readonly WebEntity[]): Map<string, WebEntity> {
  const map = new Map<string, WebEntity>();
  const note = (kind: WebKind, id: string, name: string, image: string | null) => {
    const key = nodeKey(kind, id);
    if (!map.has(key)) map.set(key, { key, kind, id, name, image, attitude: null });
  };
  for (const tie of ties) {
    note(tie.from_kind, tie.from_id, tie.from_name, tie.from_image);
    note(tie.to_kind, tie.to_id, tie.to_name, tie.to_image);
  }
  for (const person of people) map.set(person.key, person);
  return map;
}

/** An unordered pair, so a tie and its reverse land on one line. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}--${b}` : `${b}--${a}`;
}

function matches(name: string, query: string): boolean {
  return name.toLowerCase().includes(query);
}

/** Group the line ties between the same two nodes into one edge; kin is the stronger fact and keeps the line. */
function edgesFor(lines: readonly WorldTie[], nodes: ReadonlyMap<string, WebEntity>): RestEdge[] {
  const byPair = new Map<string, WorldTie[]>();
  for (const tie of lines) {
    const a = fromKey(tie);
    const b = toKey(tie);
    if (a === b || !nodes.has(a) || !nodes.has(b)) continue;
    const key = pairKey(a, b);
    const list = byPair.get(key);
    if (list) list.push(tie);
    else byPair.set(key, [tie]);
  }

  const edges: RestEdge[] = [];
  for (const [key, ties] of byPair) {
    const primary = ties.find((t) => t.source === "kin") ?? ties[0];
    const word = tieWord(primary, "from");
    edges.push({
      key,
      source: fromKey(primary),
      target: toKey(primary),
      family: tieFamily(primary),
      ties,
      label: ties.length > 1 ? `${word} +${ties.length - 1}` : word,
      arrow: primary.source === "kin" && primary.type === "parent_of",
    });
  }
  return edges;
}

export function buildRestGraph(
  directory: ReadonlyMap<string, WebEntity>,
  ties: readonly WorldTie[],
  filters: RestFilters,
): RestGraph {
  const lines = ties.filter(isLine);

  // Who has a line at all, before any filter: this is what makes a place a node.
  const lined = new Set<string>();
  for (const tie of lines) {
    lined.add(fromKey(tie));
    lined.add(toKey(tie));
  }

  const candidates = new Map<string, WebEntity>();
  for (const [key, entity] of directory) {
    if (isPersonKind(entity.kind) || lined.has(key) || filters.pinned.has(key)) candidates.set(key, entity);
  }

  const counts = new Map<WebKind, number>();
  for (const entity of candidates.values()) counts.set(entity.kind, (counts.get(entity.kind) ?? 0) + 1);

  const query = filters.search.trim().toLowerCase();
  const nodes = new Map<string, WebEntity>();
  for (const [key, entity] of candidates) {
    const pinned = filters.pinned.has(key);
    if (!pinned && filters.hiddenKinds.has(entity.kind)) continue;
    if (!pinned && query && !matches(entity.name, query)) continue;
    nodes.set(key, entity);
  }

  const shown = filters.family ? lines.filter((t) => tieFamily(t) === filters.family) : lines;
  return { nodes, edges: edgesFor(shown, nodes), counts };
}

/** Faction badges on people: every membership a person holds, newest sort stable by name. */
export function badgesFor(ties: readonly WorldTie[]): Map<string, NodeFactionBadges> {
  const rows = ties
    .filter((t) => t.source === "membership")
    .map((t) => ({
      key: fromKey(t),
      faction_id: t.to_id,
      role: t.role,
      status: t.status,
      faction: { id: t.to_id, name: t.to_name, emblem_url: t.to_image },
    }));
  return factionBadgesByNode(rows, (row) => row.key);
}
