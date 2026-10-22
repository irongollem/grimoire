import type { KinKind, KinRelation, ParentRole, PersonKey } from "@/types/kinship.types";

/** One person in a family tree, NPC or PC, reduced to what the tree needs. */
export interface KinPerson {
  key: PersonKey;
  name: string;
  bornYear: number | null;
  dead: boolean;
  isPc: boolean;
}

/** A stored link with its ends as person keys. The UI edits and deletes through these, so they pass through untouched. */
export interface KinEdgeInput {
  id: string;
  from: PersonKey;
  to: PersonKey;
  kind: KinKind;
  parent_role: ParentRole | null;
  adoptive: boolean;
}

export interface KinRef {
  key: PersonKey;
  link: KinEdgeInput;
}
export interface SpouseRef extends KinRef {
  former: boolean;
}
export interface SiblingRef {
  key: PersonKey;
  derived: boolean;
  link: KinEdgeInput | null;
}

export interface KinGraph {
  people: Map<PersonKey, KinPerson>;
  /** Only links whose two ends are both in `people`. */
  links: KinEdgeInput[];
  /** Adjacency, built once so a lookup never scans the links. */
  adj: {
    parents: Map<PersonKey, KinRef[]>;
    children: Map<PersonKey, KinRef[]>;
    spouses: Map<PersonKey, SpouseRef[]>;
    siblings: Map<PersonKey, KinRef[]>;
    relatives: Map<PersonKey, KinRef[]>;
    byPerson: Map<PersonKey, KinEdgeInput[]>;
  };
}

function push<V>(map: Map<PersonKey, V[]>, key: PersonKey, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function buildKinGraph(people: KinPerson[], links: KinEdgeInput[]): KinGraph {
  const peopleMap = new Map<PersonKey, KinPerson>();
  for (const p of people) if (!peopleMap.has(p.key)) peopleMap.set(p.key, p);

  const adj: KinGraph["adj"] = {
    parents: new Map(),
    children: new Map(),
    spouses: new Map(),
    siblings: new Map(),
    relatives: new Map(),
    byPerson: new Map(),
  };
  const kept: KinEdgeInput[] = [];
  const seenIds = new Set<string>();

  for (const link of links) {
    if (link.from === link.to) continue;
    if (!peopleMap.has(link.from) || !peopleMap.has(link.to)) continue;
    if (seenIds.has(link.id)) continue;
    seenIds.add(link.id);
    kept.push(link);
    push(adj.byPerson, link.from, link);
    push(adj.byPerson, link.to, link);
    switch (link.kind) {
      case "parent":
        push(adj.children, link.from, { key: link.to, link });
        push(adj.parents, link.to, { key: link.from, link });
        break;
      case "spouse":
      case "former_spouse": {
        const former = link.kind === "former_spouse";
        push(adj.spouses, link.from, { key: link.to, former, link });
        push(adj.spouses, link.to, { key: link.from, former, link });
        break;
      }
      case "sibling":
        push(adj.siblings, link.from, { key: link.to, link });
        push(adj.siblings, link.to, { key: link.from, link });
        break;
      case "relative":
        push(adj.relatives, link.from, { key: link.to, link });
        push(adj.relatives, link.to, { key: link.from, link });
        break;
    }
  }
  return { people: peopleMap, links: kept, adj };
}

const NONE: never[] = [];

export function parentsOf(g: KinGraph, key: PersonKey): KinRef[] {
  return g.adj.parents.get(key) ?? NONE;
}
export function childrenOf(g: KinGraph, key: PersonKey): KinRef[] {
  return g.adj.children.get(key) ?? NONE;
}
export function spousesOf(g: KinGraph, key: PersonKey): SpouseRef[] {
  return g.adj.spouses.get(key) ?? NONE;
}
export function relativesOf(g: KinGraph, key: PersonKey): KinRef[] {
  return g.adj.relatives.get(key) ?? NONE;
}

/** Stored sibling links, plus anyone sharing at least one parent. A stored link wins over a derived one. */
export function siblingsOf(g: KinGraph, key: PersonKey): SiblingRef[] {
  const out = new Map<PersonKey, SiblingRef>();
  for (const s of g.adj.siblings.get(key) ?? NONE) {
    if (s.key !== key && !out.has(s.key)) out.set(s.key, { key: s.key, derived: false, link: s.link });
  }
  for (const parent of parentsOf(g, key)) {
    for (const child of childrenOf(g, parent.key)) {
      if (child.key !== key && !out.has(child.key)) out.set(child.key, { key: child.key, derived: true, link: null });
    }
  }
  return [...out.values()];
}

/** What the other end of `link` is to `viewer`. */
export function relationTo(link: KinEdgeInput, viewer: PersonKey): KinRelation {
  if (link.kind === "parent") return viewer === link.from ? "child" : "parent";
  return link.kind;
}

function cmpPeople(g: KinGraph) {
  return (a: { key: PersonKey }, b: { key: PersonKey }): number => {
    const pa = g.people.get(a.key);
    const pb = g.people.get(b.key);
    const ya = pa?.bornYear ?? null;
    const yb = pb?.bornYear ?? null;
    if (ya !== yb) {
      if (ya === null) return 1;
      if (yb === null) return -1;
      return ya - yb;
    }
    return (pa?.name ?? "").localeCompare(pb?.name ?? "") || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  };
}

export interface Family {
  parents: KinRef[];
  spouses: SpouseRef[];
  siblings: SiblingRef[];
  children: KinRef[];
  relatives: KinRef[];
}

/** Everyone one step from `key`, each list oldest first (unknown birth years last), then by name. */
export function familyOf(g: KinGraph, key: PersonKey): Family {
  const cmp = cmpPeople(g);
  return {
    parents: [...parentsOf(g, key)].sort(cmp),
    spouses: [...spousesOf(g, key)].sort(cmp),
    siblings: siblingsOf(g, key).sort(cmp),
    children: [...childrenOf(g, key)].sort(cmp),
    relatives: [...relativesOf(g, key)].sort(cmp),
  };
}

export function linkBetween(g: KinGraph, a: PersonKey, b: PersonKey): KinEdgeInput | null {
  for (const link of g.adj.byPerson.get(a) ?? NONE) {
    if ((link.from === a && link.to === b) || (link.from === b && link.to === a)) return link;
  }
  return null;
}
