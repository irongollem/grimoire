/**
 * Client helpers over the World Web catalogue (#1084): what words a tie reads
 * as, which types two things can hold, and how a new link is written. Pure, so
 * the Connections block, the picker, the web and search all describe a tie the
 * same way.
 */
import {
  pairFor,
  QUEST_RECORDS,
  WORLD_LINK_PAIRS,
  type ConnectionKind,
  type LinkFamily,
  type LinkKind,
  type LinkTypeDef,
  type RecordTypeDef,
} from "@edge-shared/worldLinkCatalogue.ts";
import type { Connection, WorldLink, WorldRef } from "@/types/connections.types";

/** The order a sheet groups its connections in, everywhere (#1084 decision 5). */
export const CONNECTION_GROUP_ORDER: readonly ConnectionGroup[] = ["people", "factions", "places", "deities", "items", "quests"];
export type ConnectionGroup = "people" | "factions" | "places" | "deities" | "items" | "quests";

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

/** Every type def with this key, link or record, for the pair joining these kinds; quest records for a quest. */
function defFor(kindA: ConnectionKind, kindB: ConnectionKind, key: string): LinkTypeDef | RecordTypeDef | null {
  if (kindA === "quest" || kindB === "quest") return QUEST_RECORDS.find((r) => r.key === key) ?? null;
  const found = pairFor(kindA, kindB);
  if (!found) return null;
  return found.pair.types.find((t) => t.key === key) ?? found.pair.records?.find((r) => r.key === key) ?? null;
}

/**
 * The word a connection reads as from the thing on screen ("worships", "worshipped by").
 * `subjectKind` is the kind of the thing whose sheet it is.
 */
export function connectionWord(row: Pick<Connection, "type" | "outward" | "other_kind">, subjectKind: LinkKind): string {
  const def = row.outward ? defFor(subjectKind, row.other_kind, row.type) : defFor(row.other_kind, subjectKind, row.type);
  if (!def) return row.type.replaceAll("_", " ");
  return row.outward ? def.forward : def.reverse;
}

/** A link type's family (its colour); records are their own family. */
export function connectionFamily(row: Pick<Connection, "source" | "type" | "outward" | "other_kind">, subjectKind: LinkKind): LinkFamily {
  if (row.source !== "link") return "record";
  const def = row.outward ? defFor(subjectKind, row.other_kind, row.type) : defFor(row.other_kind, subjectKind, row.type);
  return def && "family" in def ? def.family : "bond";
}

/** One choice in a type picker between the thing on screen and another. */
export interface TypeChoice {
  /** The catalogue key; with `home` it names a record type rather than a link. */
  key: string;
  /** Read from the thing on screen: "worships", or "apprentice of" when the screen is the `to` end. */
  word: string;
  /** Whether the thing on screen is stored as the `from` end. */
  subjectIsFrom: boolean;
  family: LinkFamily;
  common: boolean;
  /** Set for a record type: where choosing it writes. */
  home?: RecordTypeDef["home"];
  /** A record holding one value for its `from` end: choosing it replaces the old one. */
  single?: boolean;
}

/**
 * Every type the thing on screen (`subject`) can hold towards `other`, read from
 * the subject. For two people an asymmetric type is offered both ways ("mentor of"
 * and "apprentice of") because either can be the stored `from`.
 */
export function typeChoices(subject: LinkKind, other: LinkKind): TypeChoice[] {
  const choices: TypeChoice[] = [];
  for (const pair of WORLD_LINK_PAIRS) {
    const forward = pair.from.includes(subject) && pair.to.includes(other);
    const backward = pair.from.includes(other) && pair.to.includes(subject);
    if (!forward && !backward) continue;
    for (const t of pair.types) {
      if (forward) choices.push({ key: t.key, word: t.forward, subjectIsFrom: true, family: t.family, common: t.common === true });
      // A symmetric type reads the same from either end, so it is offered once.
      if (backward && !(forward && t.symmetric)) {
        choices.push({ key: t.key, word: t.reverse, subjectIsFrom: false, family: t.family, common: t.common === true });
      }
    }
    for (const r of pair.records ?? []) {
      const directions = [forward ? true : null, backward && !(forward && r.forward === r.reverse) ? false : null]
        .filter((d): d is boolean => d !== null);
      for (const subjectIsFrom of directions) {
        const fromKind = subjectIsFrom ? subject : other;
        const toKind = subjectIsFrom ? other : subject;
        if (r.fromKinds && !r.fromKinds.includes(fromKind)) continue;
        if (r.toKinds && !r.toKinds.includes(toKind)) continue;
        choices.push({
          key: r.key,
          word: subjectIsFrom ? r.forward : r.reverse,
          subjectIsFrom,
          family: "record",
          common: r.common === true,
          home: r.home,
          ...(r.single ? { single: true } : {}),
        });
      }
    }
  }
  return choices;
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
