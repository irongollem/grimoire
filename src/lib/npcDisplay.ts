import type { Npc } from "@/types/npc.types";

// Per-field reveal toggles surfaced to the DM. Status + relationship are
// intentionally absent — both have an "unknown" value, so they're always
// shown to players and read as "unknown" until the DM sets them otherwise.
export const NPC_PLAYER_FIELDS = [
  { key: "portrait",   label: "Portrait" },
  { key: "name",       label: "Name" },
  { key: "race",       label: "Species" },
  { key: "occupation", label: "Occupation" },
  { key: "location",   label: "Location" },
] as const;
export type NpcPlayerFieldKey = typeof NPC_PLAYER_FIELDS[number]["key"];

export function isNpcConcealed(npc: Pick<Npc, "disguise_name" | "disguise_portrait_url" | "is_revealed">): boolean {
  return !!(npc.disguise_name || npc.disguise_portrait_url) && !npc.is_revealed;
}

// `name` is non-null on a DM's own NPC (DB NOT NULL), but the player projection
// `get_player_visible_npcs` returns null when the name isn't player-visible — so
// the param and return are honestly nullable. Callers must handle the null
// "no name" case (the player UI shows "???"); never coerce it to "".
export function getNpcDisplayName(npc: { name: string | null; disguise_name: string | null; disguise_portrait_url: string | null; is_revealed: boolean }): string | null {
  return isNpcConcealed(npc) && npc.disguise_name ? npc.disguise_name : npc.name;
}

export function getNpcDisplayPortrait(npc: Pick<Npc, "portrait_url" | "disguise_name" | "disguise_portrait_url" | "is_revealed">): string | null {
  return isNpcConcealed(npc) && npc.disguise_portrait_url ? npc.disguise_portrait_url : npc.portrait_url;
}

export function getNpcDisplayFocalPoint(
  npc: Pick<Npc, "portrait_focal_point" | "disguise_portrait_url" | "disguise_portrait_focal_point" | "disguise_name" | "is_revealed">,
): { x: number; y: number } | null | undefined {
  return isNpcConcealed(npc) && npc.disguise_portrait_url
    ? npc.disguise_portrait_focal_point
    : npc.portrait_focal_point;
}
