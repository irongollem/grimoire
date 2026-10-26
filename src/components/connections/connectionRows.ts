/**
 * What the Connections block shows (#1084), as plain data: the rows grouped in
 * the one order every sheet uses, a long list of records folded into one line,
 * where each name goes, and the words for a record's home. Pure, so the block,
 * the row and the tests agree on all of it.
 */
import type { ConnectionKind, LinkKind } from "@edge-shared/worldLinkCatalogue.ts";
import { CONNECTION_GROUP_TITLES, groupByKind, peopleOf, typeChoices, type ConnectionGroup, type TypeChoice } from "@/lib/worldLinks/connections";
import { dmSheetPath } from "@/lib/worldWeb/kinds";
import { HEAD_ROLES, NPC_FACTION_ROLES } from "@/types/faction.types";
import type { KinRelation } from "@/types/kinship.types";
import type { Connection, ConnectionSource, WorldRef } from "@/types/connections.types";

/** The dashed word beside a record's type: where the tie is kept. */
export const HOME_LABEL: Record<Exclude<ConnectionSource, "link">, string> = {
  membership: "membership",
  kin: "kin",
  npc_home: "home",
  pc_place: "home",
  keeper: "keeper",
  seat: "seat",
  patron_deity: "patron",
  inventory: "inventory",
  store: "store",
  quest: "quest",
};

/** Where a choice's tie lives, for the picker ("Kin · moves to Family"). */
export function choiceHomeNote(choice: Pick<TypeChoice, "home">): string | null {
  switch (choice.home) {
    case undefined:
      return null;
    case "kin":
      return "Kin · moves to Family";
    case "membership":
      return "Membership · edits the faction roster";
    case "inventory":
      return "Inventory · goes in their pack";
    case "store":
      return "Store · goes on the shelf";
    case "npc_home":
    case "pc_place":
      return "Home · a person has one";
    case "keeper":
      return "Keeper · set on the place";
    case "seat":
      return "Seat · a faction has one";
    case "patron_deity":
      return "Patron deity · a character has one";
    case "quest":
      return "Quest · set on the quest";
  }
}

/** Past this many, a place's residents or a faction's members fold into one line. */
export const COLLAPSE_AT = 5;

export type BlockEntry =
  | { kind: "row"; key: string; connection: Connection }
  | { kind: "summary"; key: string; text: string; points: string; home: string };

export interface BlockGroup {
  group: ConnectionGroup;
  title: string;
  entries: BlockEntry[];
}

function rowKey(c: Connection): string {
  return `${c.source}:${c.row_id}:${c.type}:${c.other_kind}:${c.other_id}:${c.outward ? "o" : "i"}`;
}

/**
 * A record that is already a long list somewhere else on the sheet is one line
 * here that points at it: a place's residents ("People in the Area"), a
 * faction's roster ("Members"). Returns the summary and the rows it replaced.
 */
function collapsed(subject: WorldRef, rows: Connection[]): { summary: BlockEntry; folded: Set<Connection> } | null {
  if (subject.kind !== "location" && subject.kind !== "faction") return null;
  const people = peopleOf(subject.kind, rows);
  if (people.length <= COLLAPSE_AT) return null;
  if (subject.kind === "location") {
    return {
      summary: { kind: "summary", key: "summary:residents", text: `${people.length} people live here`, points: "People in the Area", home: HOME_LABEL.npc_home },
      folded: new Set(people),
    };
  }
  const party = people.filter((c) => c.other_kind === "party_member").length;
  const text = party > 0 ? `${people.length} members, ${party} of the party` : `${people.length} members`;
  return { summary: { kind: "summary", key: "summary:members", text, points: "Members", home: HOME_LABEL.membership }, folded: new Set(people) };
}

/** Rows grouped by the other end's kind, in the order every sheet uses; an empty group is absent. */
export function groupConnections(subject: WorldRef, connections: readonly Connection[]): BlockGroup[] {
  return groupByKind(connections, (c) => c.other_kind).map(({ group, items: rows }) => {
    const fold = collapsed(subject, rows);
    const entries: BlockEntry[] = [];
    if (fold) entries.push(fold.summary);
    for (const c of rows) if (!fold?.folded.has(c)) entries.push({ kind: "row", key: rowKey(c), connection: c });
    return { group, title: CONNECTION_GROUP_TITLES[group], entries };
  });
}

/**
 * The record a tie is kept in, as a page to open, when that is not the sheet on
 * screen: a membership's faction, a home's person, a pack's owner, a shelf's
 * place. Null when the sheet is itself the home.
 */
export function homeRoute(c: Connection, subject: WorldRef): string | null {
  if (c.source === "link" || c.source === "kin") return null;
  const owner: ConnectionKind = ownerKind(c, subject.kind);
  if (owner === subject.kind) return null;
  const other = c.other_kind;
  if (owner === other) return dmSheetPath({ kind: other, id: c.other_id });
  return null;
}

function ownerKind(c: Connection, subjectKind: LinkKind): ConnectionKind {
  const kinds: ConnectionKind[] = [subjectKind, c.other_kind];
  const has = (k: ConnectionKind) => kinds.includes(k);
  switch (c.source) {
    case "membership":
    case "seat":
      return "faction";
    case "keeper":
    case "store":
      return "location";
    case "quest":
      return "quest";
    case "npc_home":
      return "npc";
    case "pc_place":
    case "patron_deity":
      return "party_member";
    case "inventory":
      return has("npc") ? "npc" : "party_member";
    default:
      return subjectKind;
  }
}

/** The faction and the person of a membership row, whichever end the sheet is. */
export function membershipEnds(c: Connection, subject: WorldRef): { factionId: string; personKind: "npc" | "party_member"; personId: string } | null {
  if (c.source !== "membership") return null;
  if (subject.kind === "faction") {
    if (c.other_kind !== "npc" && c.other_kind !== "party_member") return null;
    return { factionId: subject.id, personKind: c.other_kind, personId: c.other_id };
  }
  if (subject.kind !== "npc" && subject.kind !== "party_member") return null;
  return { factionId: c.other_id, personKind: subject.kind, personId: subject.id };
}

/** Whether this choice is the tie's current type, read from the sheet's side. */
export function isCurrentChoice(c: Connection, choice: TypeChoice, word: string): boolean {
  return choice.key === c.type && choice.word === word && (choice.home === undefined) === (c.source === "link");
}

/** Common types first (chips), the rest behind "more…". */
export function splitChoices(choices: readonly TypeChoice[]): { common: TypeChoice[]; more: TypeChoice[] } {
  return { common: choices.filter((c) => c.common), more: choices.filter((c) => !c.common) };
}

/** The roles a membership can take: a faction that already has a head does not offer the head roles again. */
export function offeredRoles(headed: boolean, current: string | null = null): readonly string[] {
  if (!headed || (current !== null && HEAD_ROLES.includes(current))) return NPC_FACTION_ROLES;
  return NPC_FACTION_ROLES.filter((r) => !HEAD_ROLES.includes(r));
}

/** What the far end's sheet calls the same tie ("creditor of" there, "owes" here). */
export function oppositeWord(subjectKind: LinkKind, otherKind: LinkKind, choice: TypeChoice): string {
  const theirs = typeChoices(otherKind, subjectKind).find(
    (c) => c.key === choice.key && c.home === choice.home && c.subjectIsFrom !== choice.subjectIsFrom,
  );
  return theirs ? theirs.word : choice.word;
}

/** The kin relation a kin choice stands for, as the Add relative dialog words it (the subject is the first term). */
export function kinRelationFor(choice: Pick<TypeChoice, "key" | "subjectIsFrom">): KinRelation {
  switch (choice.key) {
    case "parent_of":
      return choice.subjectIsFrom ? "parent" : "child";
    case "spouse_of":
      return "spouse";
    case "former_spouse_of":
      return "former_spouse";
    case "sibling_of":
      return "sibling";
    case "relative_of":
      return "relative";
    default:
      throw new Error(`"${choice.key}" is not a kin type`);
  }
}
