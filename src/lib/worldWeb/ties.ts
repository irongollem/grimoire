/**
 * A tie as the web reads it (#1084): one row of `get_world_ties` or
 * `get_player_world_ties`, from one end to the other, whatever its home.
 */
import { wordFor, type LinkFamily } from "@edge-shared/worldLinkCatalogue.ts";
import { connectionFamily } from "@/lib/worldLinks/connections";
import type { Connection, ConnectionSource } from "@/types/connections.types";
import { isLinkKind, nodeKey, type WebKind } from "./kinds";

export interface WorldTie {
  source: ConnectionSource;
  row_id: string;
  type: string;
  from_kind: WebKind;
  from_id: string;
  from_name: string;
  from_image: string | null;
  to_kind: WebKind;
  to_id: string;
  to_name: string;
  to_image: string | null;
  /** The DM's own note on a link or kin link; only the DM's read carries it. */
  note?: string | null;
  /** The line a character who knows of the tie reads. */
  told: string | null;
  /** A membership's role. */
  role: string | null;
  /** A membership's or a quest's status. */
  status: string | null;
  /** Links only, and only for the DM: who the link is revealed to. */
  player_visible_to?: string[] | null;
}

/** Kin has its own colour (`--relation-family`), so the web filters on it as a family of its own. */
export type TieFamily = LinkFamily | "kin";

export const TIE_FAMILIES: readonly TieFamily[] = ["bond", "kin", "enmity", "faith", "place", "holding", "stance", "record"];

export const TIE_FAMILY_LABELS: Record<TieFamily, string> = {
  bond: "Bonds",
  kin: "Kin",
  enmity: "Enmity",
  faith: "Faith",
  place: "Place",
  holding: "Holding",
  stance: "Stance",
  record: "Records",
};

export function fromKey(tie: WorldTie): string {
  return nodeKey(tie.from_kind, tie.from_id);
}

export function toKey(tie: WorldTie): string {
  return nodeKey(tie.to_kind, tie.to_id);
}

/** The key of the end that is not `key`. */
export function otherKey(tie: WorldTie, key: string): string {
  return fromKey(tie) === key ? toKey(tie) : fromKey(tie);
}

/** Links and kin are lines at rest; every other record groups instead. */
export function isLine(tie: WorldTie): boolean {
  return tie.source === "link" || tie.source === "kin";
}

/**
 * The tie read from one of its ends: "worships" from the worshipper's end,
 * "worshipped by" from the god's. A quest's ties are read from the quest's own
 * records rather than a pair of the catalogue.
 */
export function tieWord(tie: WorldTie, end: "from" | "to"): string {
  const outward = end === "from";
  return wordFor(outward ? tie.from_kind : tie.to_kind, outward ? tie.to_kind : tie.from_kind, tie.type, outward);
}

/** The word a tie reads as from the end whose node key is `key`. */
export function tieWordFrom(tie: WorldTie, key: string): string {
  return tieWord(tie, fromKey(tie) === key ? "from" : "to");
}

export function tieFamily(tie: WorldTie): TieFamily {
  if (tie.source === "kin") return "kin";
  if (tie.from_kind === "quest" || tie.to_kind === "quest") return "record";
  if (!isLinkKind(tie.from_kind) || !isLinkKind(tie.to_kind)) return "record";
  return connectionFamily({ source: tie.source, type: tie.type, outward: true, other_kind: tie.to_kind }, tie.from_kind);
}

/** The tie as the thing on screen (`subject`) would read it from its own sheet, for the connection writes. */
export function asConnection(tie: WorldTie, subject: string): Connection {
  const outward = fromKey(tie) === subject;
  return {
    source: tie.source,
    row_id: tie.row_id,
    type: tie.type,
    outward,
    other_kind: outward ? tie.to_kind : tie.from_kind,
    other_id: outward ? tie.to_id : tie.from_id,
    other_name: outward ? tie.to_name : tie.from_name,
    other_image: outward ? tie.to_image : tie.from_image,
    note: tie.note ?? null,
    told: tie.told,
    player_visible_to: tie.player_visible_to ?? null,
    ai_provenance: null,
    role: tie.role,
    status: tie.status,
  };
}

/** Whether the DM can retype or remove the tie from the web; a quest's ties are edited on the quest. */
export function isEditableTie(tie: WorldTie): boolean {
  return tie.source !== "quest";
}

/** One thing tied to the subject, with the tie that says how. */
export interface TieItem {
  tie: WorldTie;
  key: string;
  name: string;
  image: string | null;
  kind: WebKind;
}

/** Everything of one kind of answer: "Worships The Drowned Lady" is `word: "worships"` with the worshippers. */
export interface TieGroup {
  /** What the others are to the subject, read from their end. */
  word: string;
  items: TieItem[];
}

/**
 * A node's ties as answers (#1084 board 07): who worships her, who stands against
 * her. Grouped by the word each other thing reads towards the subject, the
 * largest answer first, people before places within it.
 */
export function groupTies(ties: readonly WorldTie[], subject: string): TieGroup[] {
  const groups = new Map<string, TieItem[]>();
  for (const tie of ties) {
    const subjectIsFrom = fromKey(tie) === subject;
    if (!subjectIsFrom && toKey(tie) !== subject) continue;
    const item: TieItem = subjectIsFrom
      ? { tie, key: toKey(tie), name: tie.to_name, image: tie.to_image, kind: tie.to_kind }
      : { tie, key: fromKey(tie), name: tie.from_name, image: tie.from_image, kind: tie.from_kind };
    const word = tieWord(tie, subjectIsFrom ? "to" : "from");
    const list = groups.get(word);
    if (list) list.push(item);
    else groups.set(word, [item]);
  }
  return [...groups.entries()]
    .map(([word, items]) => ({ word, items: items.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => b.items.length - a.items.length || a.word.localeCompare(b.word));
}
