import { kinLifeMeta, type KinClock } from "@/components/kinship/kinLifeMeta";
import { checkRelation, flipRelation, yearsAfter } from "@/components/kinship/addRelative";
import { buildKinGraph, familyOf, type KinEdgeInput, type KinGraph, type KinPerson } from "@/lib/kinship/graph";
import { kinInsertFor, parsePersonKey } from "@/lib/kinship/keys";
import { typeChoices, type TypeChoice } from "@/lib/worldLinks/connections";
import type { Connection } from "@/types/connections.types";
import type { KinKind, KinLinkUpdate, KinRelation, ParentRole, PersonKey } from "@/types/kinship.types";

/** The slice of KinPersonView a row needs, so tests and the dialog need not build a whole view. */
export interface RowPerson extends KinPerson {
  portraitUrl: string | null;
  subtitle: string | null;
  to: string | null;
}

export interface FamilyRow {
  key: PersonKey;
  person: RowPerson;
  /** What this person is to the one whose family it is. */
  relation: KinRelation;
  /** That relation in the row's own word: "father", "former spouse", or a relative's note ("cousin"). */
  word: string;
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

/** A dead person with a death year reads "1428 – 1491" (the years say it); without one, "born 1428 · dead". */
export function lifeMeta(person: KinPerson, clock: KinClock): string[] {
  const meta = kinLifeMeta(person, clock);
  return person.dead && person.diedYear === null ? [...meta, "dead"] : meta;
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
  clock: KinClock,
  /** Link notes by link id (the DM's rows only); a relative's note is what they are ("cousin"). */
  notes: ReadonlyMap<string, string> = new Map(),
): FamilyGroup[] {
  const fam = familyOf(graph, person);

  function row(
    key: PersonKey,
    relation: KinRelation,
    word: string,
    link: KinEdgeInput | null,
    extra: string[] = [],
    withDoor = false,
  ): FamilyRow | null {
    const p = people.get(key);
    if (!p) return null;
    const meta = lifeMeta(p, clock);
    if (p.isPc) meta.push("PC");
    meta.push(...extra);
    let door: string | null = null;
    if (withDoor) {
      const theirs = familyOf(graph, key);
      if (theirs.parents.length > 0 || theirs.siblings.length > 0) door = surnameOf(p.name);
    }
    return { key, person: p, relation, word, meta, link, door };
  }
  const compact = (rows: (FamilyRow | null)[]): FamilyRow[] => rows.filter((r): r is FamilyRow => r !== null);

  // The role ("mother") and "former" are the row's word now, so they are not repeated in the tags.
  const parentTag = (link: KinEdgeInput): string[] => (link.adoptive ? ["adoptive"] : []);

  const spouses = [...fam.spouses].sort((a, b) => Number(a.former) - Number(b.former));

  const groups: FamilyGroup[] = [
    {
      id: "parents",
      title: "Parents",
      caption: null,
      rows: compact(fam.parents.map((p) => row(p.key, "parent", p.link.parent_role ?? "parent", p.link, parentTag(p.link)))),
    },
    {
      id: "spouses",
      title: "Spouse",
      caption: null,
      rows: compact(spouses.map((s) => row(s.key, s.former ? "former_spouse" : "spouse", s.former ? "former spouse" : "spouse", s.link, [], true))),
    },
    {
      id: "siblings",
      title: "Siblings",
      caption: fam.siblings.some((s) => s.derived) ? "from shared parents" : null,
      rows: compact(fam.siblings.map((s) => row(s.key, "sibling", "sibling", s.link))),
    },
    {
      id: "children",
      title: "Children",
      caption: null,
      rows: compact(fam.children.map((c) => row(c.key, "child", "child", c.link, c.link.adoptive ? ["adoptive"] : []))),
    },
    {
      id: "relatives",
      title: "Relatives",
      caption: null,
      rows: compact(fam.relatives.map((r) => row(r.key, "relative", notes.get(r.link.id)?.trim() || "relative", r.link))),
    },
  ];
  return groups.filter((g) => g.rows.length > 0);
}

// ── Changing a relation in place ──────────────────────────────────────────────

/** One relation a kin row can be changed to, with what the dates or the tree say about it. */
export interface KinOption {
  /** Stable key for the list: the relation, plus the parent role when it carries one. */
  id: string;
  /** What the row's person would be to the subject. */
  relation: KinRelation;
  role: ParentRole | null;
  label: string;
  current: boolean;
  /** Spoken inline when the choice is contradicted; null when nothing is. */
  problem: string | null;
  /** A loop or an already-implied sibling cannot be saved; a date clash can (the DM may mean it). */
  blocked: boolean;
}

const KIN_CHOICES: { relation: KinRelation; role: ParentRole | null; label: string }[] = [
  { relation: "parent", role: "father", label: "Father" },
  { relation: "parent", role: "mother", label: "Mother" },
  { relation: "parent", role: null, label: "Parent" },
  { relation: "child", role: null, label: "Child" },
  { relation: "spouse", role: null, label: "Spouse" },
  { relation: "former_spouse", role: null, label: "Former spouse" },
  { relation: "sibling", role: null, label: "Sibling" },
  { relation: "relative", role: null, label: "Relative" },
];

/**
 * The kin relations a row can move to, each judged by the add dialog's own
 * `checkRelation` against the graph without this row's link (the pair's current
 * link is what is being replaced, so it can be neither the loop nor the clash).
 */
export function kinOptions(graph: KinGraph, subject: PersonKey, row: FamilyRow): KinOption[] {
  const link = row.link;
  if (!link) return [];
  const without = buildKinGraph([...graph.people.values()], graph.links.filter((l) => l.id !== link.id));
  const subjectName = graph.people.get(subject)?.name ?? "They";
  return KIN_CHOICES.map((c) => {
    const current = c.relation === row.relation && (c.relation !== "parent" || (c.role ?? null) === link.parent_role);
    let problem: string | null = null;
    let blocked = false;
    if (!current) {
      // The dialog's relation is the subject's to the other, so it is the row's relation flipped.
      const v = checkRelation(without, subject, flipRelation(c.relation), row.key);
      if (v.kind === "cycle") {
        problem = "That would make someone their own ancestor.";
        blocked = true;
      } else if (v.kind === "implied-sibling") {
        problem = "They are already siblings through shared parents.";
        blocked = true;
      } else if (v.kind === "dates") {
        const parentName = c.relation === "parent" ? row.person.name : subjectName;
        const childName = c.relation === "parent" ? subjectName : row.person.name;
        problem = `${parentName} was born ${yearsAfter(v.parentBorn, v.childBorn)} ${childName}.`;
      }
    }
    return { id: c.role ? `${c.relation}:${c.role}` : c.relation, relation: c.relation, role: c.role, label: c.label, current, problem, blocked };
  });
}

/**
 * The columns that turn a kin row into another relation, in place. The pair
 * stays, `adoptive` survives where it still means something (a parent link either
 * way round), a role survives only as a chosen one (it belongs to the parent end,
 * which may have moved), and the note goes only when it was a relative's word.
 */
export function kinRetypePatch(link: KinEdgeInput, subject: PersonKey, other: PersonKey, option: KinOption, note: string): KinLinkUpdate {
  const row = kinInsertFor(subject, flipRelation(option.relation), other, {
    parent_role: option.role,
    adoptive: link.adoptive,
  });
  return {
    from_npc_id: row.from_npc_id,
    from_party_member_id: row.from_party_member_id,
    to_npc_id: row.to_npc_id,
    to_party_member_id: row.to_party_member_id,
    kind: row.kind,
    parent_role: row.parent_role ?? null,
    adoptive: row.adoptive ?? false,
    note: link.kind === "relative" ? "" : note,
    needs_sorting: false,
  };
}

const KIN_TYPE_OF: Record<KinKind, string> = {
  parent: "parent_of",
  spouse: "spouse_of",
  former_spouse: "former_spouse_of",
  sibling: "sibling_of",
  relative: "relative_of",
};

const linkKindOf = (key: PersonKey): "npc" | "party_member" => (parsePersonKey(key).type === "npc" ? "npc" : "party_member");

/** A kin row as the Connection the retype mutation takes, so a move to a bond goes through the one path. */
export function kinAsConnection(link: KinEdgeInput, subject: PersonKey, row: FamilyRow, note: string): Connection {
  const other = parsePersonKey(row.key);
  return {
    source: "kin",
    row_id: link.id,
    type: KIN_TYPE_OF[link.kind],
    outward: link.from === subject,
    other_kind: linkKindOf(row.key),
    other_id: other.id,
    other_name: row.person.name,
    other_image: row.person.portraitUrl,
    note: note || null,
    told: null,
    player_visible_to: null,
    ai_provenance: null,
    role: null,
    status: null,
  };
}

/** The bonds two people can hold, for the "move to Connections" half of the picker: no record homes, common ones first. */
export function bondChoices(subject: PersonKey, other: PersonKey): TypeChoice[] {
  const bonds = typeChoices(linkKindOf(subject), linkKindOf(other)).filter((c) => !c.home);
  return [...bonds.filter((c) => c.common), ...bonds.filter((c) => !c.common)];
}

/** "Tomas is now Brenna's sibling." */
export function retypedSentence(otherName: string, subjectName: string, option: KinOption): string {
  return `${otherName} is now ${subjectName}’s ${option.label.toLowerCase()}.`;
}
