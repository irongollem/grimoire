/**
 * Client helpers over the World Web catalogue (#1084): what words a tie reads
 * as, which types two things can hold, and how a new link is written. Pure, so
 * the Connections block, the picker, the web and search all describe a tie the
 * same way. Pure on purpose: the public Open Book reader imports it, so the
 * database read lives in `connectionsQuery.ts`.
 */
import {
  typeChoices,
  typeDefFor,
  wordFor,
  type ConnectionKind,
  type LinkFamily,
  type LinkKind,
  type TypeChoice,
} from "@edge-shared/worldLinkCatalogue.ts";
import type { Connection, ConnectionSource, WorldLink, WorldRef } from "@/types/connections.types";

export { typeChoices, type TypeChoice };

/** The order a sheet groups its connections in, everywhere (#1084 decision 5). */
export const CONNECTION_GROUP_ORDER: readonly ConnectionGroup[] = ["people", "factions", "places", "deities", "items", "quests"];
export type ConnectionGroup = "people" | "factions" | "places" | "deities" | "items" | "quests";

/** What a group is called wherever it is printed: a sheet, a book, a player's list. */
export const CONNECTION_GROUP_TITLES: Record<ConnectionGroup, string> = {
  people: "People",
  factions: "Factions",
  places: "Places",
  deities: "Deities",
  items: "Items",
  quests: "Quests",
};

export function groupFor(kind: ConnectionKind): ConnectionGroup {
  switch (kind) {
    case "npc":
    case "party_member":
      return "people";
    case "faction":
      return "factions";
    case "location":
      return "places";
    case "deity":
      return "deities";
    case "item":
      return "items";
    case "quest":
      return "quests";
  }
}

/** Items grouped by the kind of their far end, in the order every sheet uses; an empty group is absent. */
export function groupByKind<T>(items: readonly T[], kindOf: (item: T) => ConnectionKind): { group: ConnectionGroup; items: T[] }[] {
  return CONNECTION_GROUP_ORDER.map((group) => ({ group, items: items.filter((item) => groupFor(kindOf(item)) === group) }))
    .filter((g) => g.items.length > 0);
}

/** Which record homes hold a place's or a faction's people: a place's residents and the PCs there, a faction's members. */
const PEOPLE_SOURCES: Record<"location" | "faction", readonly ConnectionSource[]> = {
  location: ["npc_home", "pc_place"],
  faction: ["membership"],
};

/** The people rows of a place or faction, out of its connections. */
export function peopleOf(kind: "location" | "faction", connections: readonly Connection[]): Connection[] {
  const sources = PEOPLE_SOURCES[kind];
  return connections.filter((c) => sources.includes(c.source) && (c.other_kind === "npc" || c.other_kind === "party_member"));
}

/**
 * The word a connection reads as from the thing on screen ("worships", "worshipped by").
 * `subjectKind` is the kind of the thing whose sheet it is.
 */
export function connectionWord(row: Pick<Connection, "type" | "outward" | "other_kind">, subjectKind: LinkKind): string {
  return wordFor(subjectKind, row.other_kind, row.type, row.outward);
}

/** A link type's family (its colour); records are their own family. */
export function connectionFamily(row: Pick<Connection, "source" | "type" | "outward" | "other_kind">, subjectKind: LinkKind): LinkFamily {
  if (row.source !== "link") return "record";
  const def = typeDefFor(subjectKind, row.other_kind, row.type);
  return def && "family" in def ? def.family : "bond";
}

const END_COLUMN: Record<LinkKind, string> = {
  npc: "npc_id",
  party_member: "party_member_id",
  faction: "faction_id",
  location: "location_id",
  deity: "deity_id",
  item: "item_id",
};

/** The insert payload for a link between two things, in the direction the choice stores it. */
export function linkInsert(subject: WorldRef, other: WorldRef, choice: Pick<TypeChoice, "key" | "subjectIsFrom">):
  Pick<WorldLink, "from_kind" | "to_kind" | "type"> & Record<string, string> {
  const from = choice.subjectIsFrom ? subject : other;
  const to = choice.subjectIsFrom ? other : subject;
  return {
    from_kind: from.kind,
    to_kind: to.kind,
    type: choice.key,
    [`from_${END_COLUMN[from.kind]}`]: from.id,
    [`to_${END_COLUMN[to.kind]}`]: to.id,
  };
}

/** The far end of a link from one of its ends. */
export function otherEnd(link: WorldLink, selfId: string): WorldRef {
  return link.from_id === selfId ? { kind: link.to_kind, id: link.to_id } : { kind: link.from_kind, id: link.from_id };
}
