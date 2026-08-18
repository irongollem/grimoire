import type { Npc, NpcRelationship, NpcStatus } from "@/types/npc.types";

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
const NPC_STATUS_BG: Record<NpcStatus, string> = {
  alive: "bg-tone-success",
  dead: "bg-tone-danger",
  missing: "bg-tone-caution",
  unknown: "bg-muted-foreground",
};

export function npcStatusBg(status: NpcStatus): string {
  return NPC_STATUS_BG[status] ?? NPC_STATUS_BG.unknown;
}

/**
 * How an NPC feels about the party, as theme tokens (#742).
 *
 * These were six hex literals in `npc.types.ts`, applied through inline
 * `:style` bindings, on the reasoning that Tailwind extracts classes statically
 * so `bg-[${color}]` cannot work at runtime. Half right: a *computed* class
 * cannot work, but a static map from enum value to a class literal can — every
 * string below is in the source, so Tailwind sees them all.
 *
 * The cost of the old way was that the ramp did not follow the theme: one set
 * of hues, picked against parchment, also used on near-black. Now a theme can
 * repaint it, and a step that goes muddy in dark mode is a one-line override in
 * `theme.css` rather than an edit at fourteen call sites.
 *
 * Two shapes, because two kinds of consumer:
 *
 *   *Class — the DOM. A badge, a dot, a bar. Prefer this.
 *   *Var   — a value, for the places a class cannot reach: an SVG `fill`
 *            (attribute values don't take a class), and the force-graph, which
 *            paints to a canvas and needs a resolved colour string.
 *
 * Both point at the same token, so they cannot drift.
 */
export const NPC_RELATIONSHIP_BG: Record<NpcRelationship, string> = {
  hostile: "bg-relationship-hostile",
  unfriendly: "bg-relationship-unfriendly",
  indifferent: "bg-relationship-indifferent",
  friendly: "bg-relationship-friendly",
  helpful: "bg-relationship-helpful",
  unknown: "bg-relationship-unknown",
};

export const NPC_RELATIONSHIP_TEXT: Record<NpcRelationship, string> = {
  hostile: "text-relationship-hostile",
  unfriendly: "text-relationship-unfriendly",
  indifferent: "text-relationship-indifferent",
  friendly: "text-relationship-friendly",
  helpful: "text-relationship-helpful",
  unknown: "text-relationship-unknown",
};

/** Token names. `var()` and canvas resolution are both built from these, so the
 *  three shapes cannot name different colours. */
const NPC_RELATIONSHIP_TOKENS: Record<NpcRelationship, string> = {
  hostile: "--relationship-hostile",
  unfriendly: "--relationship-unfriendly",
  indifferent: "--relationship-indifferent",
  friendly: "--relationship-friendly",
  helpful: "--relationship-helpful",
  unknown: "--relationship-unknown",
};

function relationshipToken(relationship: NpcRelationship): string {
  return NPC_RELATIONSHIP_TOKENS[relationship] ?? NPC_RELATIONSHIP_TOKENS.indifferent;
}

/** Background class for a relationship. Falls back to the neutral step. */
export function npcRelationshipBg(relationship: NpcRelationship): string {
  return NPC_RELATIONSHIP_BG[relationship] ?? NPC_RELATIONSHIP_BG.indifferent;
}

/** Text-colour class for a relationship. */
export function npcRelationshipText(relationship: NpcRelationship): string {
  return NPC_RELATIONSHIP_TEXT[relationship] ?? NPC_RELATIONSHIP_TEXT.indifferent;
}

/** The token as a `var()`, for an SVG `fill` bound through `:style`. */
export function npcRelationshipVar(relationship: NpcRelationship): string {
  return `var(${relationshipToken(relationship)})`;
}

/**
 * The colour as a concrete value, for painting to a canvas.
 *
 * The NPC web is a force-graph drawn on a canvas, and `ctx.fillStyle` cannot
 * take `var(--x)` or a class — it needs a resolved string. Reading the custom
 * property is the only way to keep that one consumer on the same ramp as
 * everything else rather than letting it keep a private copy, which is exactly
 * how it drifted: its copy was still keyed on the pre-5e values
 * (`ally`/`neutral`/`enemy`), so once `20260519000001` moved the enum on it
 * matched nothing and every node fell through to the default grey.
 *
 * Resolved at call time, so a graph rebuilt after a theme switch picks up the
 * new palette; one already on screen keeps the old colours until it re-renders.
 */
export function npcRelationshipCanvasColor(relationship: NpcRelationship): string {
  if (typeof document === "undefined") return "#6b7280";
  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(relationshipToken(relationship))
    .trim();
  return resolved || "#6b7280";
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
