// ── Site handoff: pure derivations (#850 story H, epic #780) ────────────────
//
// `QuestSiteHandoff` and `SiteRoomList` both need small, easy-to-get-wrong
// answers about a site's rooms — is this room unwritten, what does its list
// caption say, where does the party sit in the site's own order, which rooms
// still hold loot. Kept here, pure and colocated-tested, the same convention
// `lib/locations/siteRun.ts` set for the site runner.

import { extractTiptapText } from "@/lib/utils";
import type { Location } from "@/types/location.types";
import type { LootPlacement } from "@/types/quest.types";

/**
 * A room with no authored content at all — the frame's dashed "Unwritten"
 * row, caption "Prep gap — write it or roll it". `extractTiptapText(..., 1)`
 * is enough to tell "nothing" from "something": a room whose first character
 * survives the extraction has *some* DM content, however short.
 */
export function isRoomUnwritten(description: string | null): boolean {
  return extractTiptapText(description, 1).length === 0;
}

/** Every unwritten room among `rooms`, as a lookup the row list can test
 *  membership against without re-parsing Tiptap JSON per render. */
export function unwrittenRoomIds(rooms: readonly Pick<Location, "id" | "description">[]): Set<string> {
  return new Set(rooms.filter((room) => isRoomUnwritten(room.description)).map((room) => room.id));
}

/**
 * A written room's list caption. It is deliberately just the DM's own
 * description, truncated — "Athletics DC 12", "Encounter · 4 sodden husks" —
 * with " · cleared" appended once the room's `cleared` fact is asserted true.
 * Never called for an unwritten room, which renders its own fixed caption
 * ("Prep gap — write it or roll it") instead.
 */
export function roomRowCaption(description: string | null, cleared: boolean): string {
  const text = extractTiptapText(description, 60);
  if (!cleared) return text;
  return text ? `${text} · cleared` : "Cleared";
}

/**
 * The party's 1-based position in `orderedRoomIds` (the site's own
 * `compareSiblings` order) — `null` when the party isn't in any room of this
 * site right now, same "no current room" answer `partyRoomInSite` gives.
 * Callers turn this into "room 2 of 6" or "not yet inside"; kept as a plain
 * number here so both captions ("room N of M" and "leaves this site at room
 * N") can be built from one answer instead of parsing each other's strings.
 */
export function roomOrdinal(currentRoomId: string | null, orderedRoomIds: readonly string[]): number | null {
  if (currentRoomId === null) return null;
  const index = orderedRoomIds.indexOf(currentRoomId);
  return index === -1 ? null : index + 1;
}

/**
 * Rooms of a site that currently hold loot worth flagging in the list —
 * `held`, not yet dropped to chat. `location_id` is the only real payoff
 * signal a room carries: `quest_consequences` has no location column, so
 * there is no room-anchored "knowledge" fact to gate a second chip on (see
 * `scratchpad/facts/site.md`) — the Room Payoff panel is loot-only for the
 * same reason. This is that same constraint, read back a level.
 */
export function roomsWithHeldLoot(loot: readonly Pick<LootPlacement, "location_id" | "delivery_state">[]): Set<string> {
  const ids = new Set<string>();
  for (const entry of loot) {
    if (entry.location_id && entry.delivery_state === "held") ids.add(entry.location_id);
  }
  return ids;
}
