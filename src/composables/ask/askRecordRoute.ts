/** Ask Grimoire (#1253): where a record the answer names is opened. Null for a kind with no page of its own. */
import type { AskRecordRef } from "@edge-shared/agent/askContract";
import { questLinkHref } from "@/lib/quests/navigation";
import { searchRoute } from "@/lib/search/searchRoute";

export function askRecordRoute(ref: Pick<AskRecordRef, "type" | "id">): string | null {
  switch (ref.type) {
    case "npc":
    case "party_member":
    case "monster":
    case "note":
    case "spell":
    case "item":
    case "location":
    case "faction":
    case "deity":
    case "canon":
      return searchRoute(ref.type, encodeURIComponent(ref.id));
    case "quest": return questLinkHref(ref.id);
    case "encounter": return `/encounters/${encodeURIComponent(ref.id)}`;
    // A beat's page needs its quest's id and a room's page needs its site; the reference carries neither.
    case "quest_beat":
    case "room":
      return null;
  }
}

/** The small label beside a link: what kind of thing it is. */
export const RECORD_KIND_LABEL: Record<AskRecordRef["type"], string> = {
  npc: "NPC", monster: "monster", item: "item", spell: "spell", location: "place", faction: "faction", quest: "quest",
  quest_beat: "beat", encounter: "encounter", deity: "deity", party_member: "party", note: "note", canon: "canon", room: "room",
};

/** The generator's own page, for "I can't run that one from here yet". Only the ones that have a page to create on. */
const GENERATOR_PAGE: Record<string, string> = {
  npc: "/npcs/new",
  monster: "/monsters/new",
  item: "/vault/new",
  spell: "/spells/new",
  location: "/locations/new",
  faction: "/factions/new",
  encounter: "/encounters/new",
  deity: "/deities/new",
};

export function askGeneratorPage(generatorId: string): string | null {
  return GENERATOR_PAGE[generatorId] ?? null;
}
