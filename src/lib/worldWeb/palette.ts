import type { WebKind } from "@/lib/worldWeb/kinds";
import type { TieFamily } from "@/lib/worldWeb/ties";

// Library-free on purpose: the NPC sheet's connection chips read these, and
// importing them from the graph composable pulled v-network-graph (the `viz`
// chunk) into every NPC sheet.

/**
 * A theme custom property as a concrete value.
 *
 * The graph config takes colours as *values*: they end up on SVG presentation
 * attributes and in the layout engine, neither of which resolves `var()`. So the
 * ramps are read out of the document here, at the point the data is built, and
 * a rebuild after a theme switch picks up the new palette.
 */
export function cssValue(token: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback;
}

/** The token each family of tie is drawn in; kin keeps the family colour it had. */
export const FAMILY_TOKEN: Record<TieFamily, string> = {
  bond: "--link-bond",
  enmity: "--link-enmity",
  faith: "--link-faith",
  place: "--link-place",
  holding: "--link-holding",
  stance: "--link-stance",
  record: "--link-record",
  kin: "--relation-family",
};

export function familyColor(family: TieFamily): string {
  return cssValue(FAMILY_TOKEN[family], "#6b7280");
}

/** Node radius by kind, in screen pixels: PCs largest, an item smallest. */
const NODE_SIZE: Record<WebKind, number> = {
  npc: 18,
  party_member: 22,
  faction: 20,
  location: 18,
  deity: 19,
  item: 15,
  quest: 16,
};

export function nodeSizeFor(kind: WebKind): number {
  return NODE_SIZE[kind];
}
