import { completedYears } from "@edge-shared/npcAge";
import { familyOf, type KinEdgeInput, type KinGraph, type KinPerson } from "@/lib/kinship/graph";
import type { PersonKey } from "@/types/kinship.types";

/** The slice of KinPersonView a row needs, so tests and the dialog need not build a whole view. */
export interface RowPerson extends KinPerson {
  portraitUrl: string | null;
  subtitle: string | null;
  to: string | null;
}

export interface FamilyRow {
  key: PersonKey;
  person: RowPerson;
  /** Dates, age and tags, joined with a middle dot on screen. */
  meta: string[];
  /** The stored link behind the row; null for a derived sibling, which has nothing to remove. */
  link: KinEdgeInput | null;
  /** Surname for the "<Surname> kin" door of a spouse who has a family of their own. */
  door: string | null;
}

export interface FamilyGroup {
  id: "parents" | "spouses" | "siblings" | "children" | "relatives";
  title: string;
  caption: string | null;
  rows: FamilyRow[];
}

/** "1428 – 1491" would need a death year the model does not hold, so the dead read "born 1428 · dead". */
export function lifeMeta(person: KinPerson, todayYear: number): string[] {
  const out: string[] = [];
  if (person.bornYear !== null) {
    out.push(`born ${person.bornYear}`);
    if (!person.dead) {
      const age = completedYears({ year: person.bornYear, month: null, day: null }, { year: todayYear, month: 1, day: 1 });
      if (age !== null && age >= 0) out.push(String(age));
    }
  }
  if (person.dead) out.push("dead");
  return out;
}

/** The last word of a name, or the whole name when it has one word. */
export function surnameOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1] ?? name;
}

type PeopleMap = ReadonlyMap<PersonKey, RowPerson>;

/** The Family block's groups in design order, each only when it has someone in it. */
export function buildFamilyGroups(
  graph: KinGraph,
  people: PeopleMap,
  person: PersonKey,
  todayYear: number,
  /** Link notes by link id (the DM's rows only); a relative's note is what they are ("cousin"). */
  notes: ReadonlyMap<string, string> = new Map(),
): FamilyGroup[] {
  const fam = familyOf(graph, person);

  function row(key: PersonKey, link: KinEdgeInput | null, extra: string[] = [], withDoor = false): FamilyRow | null {
    const p = people.get(key);
    if (!p) return null;
    const meta = lifeMeta(p, todayYear);
    if (p.isPc) meta.push("PC");
    meta.push(...extra);
    let door: string | null = null;
    if (withDoor) {
      const theirs = familyOf(graph, key);
      if (theirs.parents.length > 0 || theirs.siblings.length > 0) door = surnameOf(p.name);
    }
    return { key, person: p, meta, link, door };
  }
  const compact = (rows: (FamilyRow | null)[]): FamilyRow[] => rows.filter((r): r is FamilyRow => r !== null);

  const parentTag = (link: KinEdgeInput): string[] => [
    ...(link.adoptive ? ["adoptive"] : []),
    ...(link.parent_role ? [link.parent_role] : []),
  ];

  const spouses = [...fam.spouses].sort((a, b) => Number(a.former) - Number(b.former));

  const groups: FamilyGroup[] = [
    {
      id: "parents",
      title: "Parents",
      caption: null,
      rows: compact(fam.parents.map((p) => row(p.key, p.link, parentTag(p.link)))),
    },
    {
      id: "spouses",
      title: "Spouse",
      caption: null,
      rows: compact(spouses.map((s) => row(s.key, s.link, s.former ? ["former"] : [], true))),
    },
    {
      id: "siblings",
      title: "Siblings",
      caption: fam.siblings.some((s) => s.derived) ? "from shared parents" : null,
      rows: compact(fam.siblings.map((s) => row(s.key, s.link))),
    },
    {
      id: "children",
      title: "Children",
      caption: null,
      rows: compact(fam.children.map((c) => row(c.key, c.link, c.link.adoptive ? ["adoptive"] : []))),
    },
    {
      id: "relatives",
      title: "Relatives",
      caption: null,
      rows: compact(fam.relatives.map((r) => row(r.key, r.link, [notes.get(r.link.id)?.trim() || "relative"]))),
    },
  ];
  return groups.filter((g) => g.rows.length > 0);
}
