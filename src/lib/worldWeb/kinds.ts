/**
 * What kinds of thing the World web draws, and how a node is named (#1084).
 *
 * A node key is `<kind>:<id>`. Kinds are the catalogue's: a PC is a
 * `party_member`, and a quest is a kind that only ever appears through its own
 * records.
 */
import { LINK_KINDS, type ConnectionKind, type LinkKind } from "@edge-shared/worldLinkCatalogue.ts";

export type WebKind = ConnectionKind;

export const WEB_KINDS: readonly WebKind[] = [...LINK_KINDS, "quest"];

export function isLinkKind(kind: string): kind is LinkKind {
  return (LINK_KINDS as readonly string[]).includes(kind);
}

export function isWebKind(kind: string): kind is WebKind {
  return (WEB_KINDS as readonly string[]).includes(kind);
}

export function isPersonKind(kind: WebKind): boolean {
  return kind === "npc" || kind === "party_member";
}

export function nodeKey(kind: WebKind, id: string): string {
  return `${kind}:${id}`;
}

export interface NodeRef {
  kind: WebKind;
  id: string;
}

/** Split a node key back into its kind and id; null for anything that is not one. */
export function parseNodeKey(key: string): NodeRef | null {
  const at = key.indexOf(":");
  if (at < 1) return null;
  const kind = key.slice(0, at);
  const id = key.slice(at + 1);
  return isWebKind(kind) && id !== "" ? { kind, id } : null;
}

/** The chip a kind sits under in the filter row, in the order the boards show them. */
export interface KindChip {
  kind: WebKind;
  label: string;
  /** Singular, for a panel's subtitle: "Faction", "Place". */
  noun: string;
}

export const KIND_CHIPS: readonly KindChip[] = [
  { kind: "npc", label: "People", noun: "Person" },
  { kind: "party_member", label: "Party", noun: "Party member" },
  { kind: "faction", label: "Factions", noun: "Faction" },
  { kind: "location", label: "Places", noun: "Place" },
  { kind: "deity", label: "Deities", noun: "Deity" },
  { kind: "item", label: "Items", noun: "Item" },
  { kind: "quest", label: "Quests", noun: "Quest" },
];

const CHIP_BY_KIND = new Map(KIND_CHIPS.map((c) => [c.kind, c]));

export function kindNoun(kind: WebKind): string {
  return CHIP_BY_KIND.get(kind)?.noun ?? kind;
}

/** The kinds a "Group by" can gather around, with the record each one gathers. */
export const GROUP_KINDS = ["faction", "location", "deity"] as const;
export type GroupKind = (typeof GROUP_KINDS)[number];

export function isGroupKind(kind: string): kind is GroupKind {
  return (GROUP_KINDS as readonly string[]).includes(kind);
}

/** Where a node's sheet lives for the DM. A place opens in the Atlas tree. */
export function dmSheetPath(ref: NodeRef): string {
  switch (ref.kind) {
    case "npc":
      return `/npcs/${ref.id}`;
    case "party_member":
      return `/party/${ref.id}`;
    case "faction":
      return `/factions/${ref.id}`;
    case "location":
      return `/locations?at=${ref.id}`;
    case "deity":
      return `/deities/${ref.id}`;
    case "item":
      return `/vault/${ref.id}`;
    case "quest":
      return `/quests/${ref.id}`;
  }
}

/** The page a player reads a kind on; their pages are lists that open a sheet, so this is the list. */
export function playerListPath(kind: WebKind): string | null {
  switch (kind) {
    case "npc":
    case "party_member":
      return "/play/party";
    case "faction":
      return "/play/factions";
    case "location":
      return "/play/atlas";
    case "deity":
    case "item":
    case "quest":
      return null;
  }
}
