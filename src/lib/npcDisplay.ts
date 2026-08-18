import { NPC_RELATIONSHIP_COLORS, type Npc, type NpcRelationship, type NpcStatus } from "@/types/npc.types";

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

/**
 * What a freshly-revealed NPC shows by default — enough to be a recognisable
 * entry in the players' portal rather than a blank card.
 *
 * Shared with `npcEncounterSync`, which widens an NPC's fields when the party
 * meets it mid-combat. The two apply it differently on purpose (see
 * `fieldsForFirstReveal`), but they must agree on *which* fields are the
 * baseline, and they did that by each declaring their own copy of this list.
 */
export const NPC_DEFAULT_REVEAL_FIELDS = ["name", "portrait"] as const satisfies readonly NpcPlayerFieldKey[];

/**
 * The field list to store when revealing an NPC to someone.
 *
 * Seeds the defaults only when the DM has never chosen any. Re-revealing must
 * not silently re-add fields they deliberately removed — which is why this is
 * "seed if empty" rather than the union `npcEncounterSync` takes; there, the
 * party has just *met* the NPC in combat, so widening is the point.
 */
export function fieldsForFirstReveal(current: readonly string[]): string[] {
  return current.length ? [...current] : [...NPC_DEFAULT_REVEAL_FIELDS];
}

/**
 * The dot beside an NPC's name.
 *
 * These are theme tokens rather than hex, because the four states map exactly
 * onto tones the design system already names: a dead NPC is the same red as a
 * destructive action, a missing one the same amber as a caution. Hard-coding
 * `#ef4444` next to a `--tone-danger` that resolves to `#ef4444` is two names
 * for one colour, and only one of them follows the theme.
 *
 * `unknown` is deliberately `muted-foreground` rather than a tone: it is the
 * absence of a state, not a state of its own.
 */
const NPC_STATUS_COLORS: Record<NpcStatus, string> = {
  alive: "var(--tone-success)",
  dead: "var(--tone-danger)",
  missing: "var(--tone-caution)",
  unknown: "var(--muted-foreground)",
};

export function npcStatusColor(status: NpcStatus): string {
  return NPC_STATUS_COLORS[status] ?? "var(--muted-foreground)";
}

/**
 * The relationship badge's colour.
 *
 * Still the raw ramp from `npc.types.ts` — six hues that no existing tone
 * covers (teal, orange and purple have no token), so tokenising it means adding
 * theme variables rather than pointing at ones that exist. Tracked separately;
 * it is shared with the monster CR ramp and reaches ~28 files, which is a
 * bigger change than the one this lives in.
 *
 * Centralised here regardless, so the desktop card and the mobile card cannot
 * drift — they had already grown their own copy of the lookup.
 */
export function npcRelationshipColor(relationship: NpcRelationship): string {
  return NPC_RELATIONSHIP_COLORS[relationship] ?? NPC_RELATIONSHIP_COLORS.indifferent;
}

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
