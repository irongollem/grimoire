import type { Npc, NpcUpdate } from "@/types/npc.types";

/** Fields a freshly-discovered NPC reveals by default — enough to show up as a
 *  recognisable entry in the players' portal (mirrors NpcRevealSheet's
 *  first-reveal defaults). */
const DEFAULT_REVEAL_FIELDS = ["name", "portrait"] as const;

/** Only the NPC-record fields the sync reads/widens. `Npc` satisfies this
 *  structurally, so call sites pass the real record unchanged. */
type NpcRecord = Pick<Npc, "id" | "name" | "status" | "player_visible_to" | "player_visible_fields">;

/** An NPC combatant's current standing in the fight, as the runner watches it. */
export interface NpcSyncState {
  /** The party has seen this NPC — its token is at `reveal_state "revealed"`. */
  seen: boolean;
  /** This NPC's token has dropped to 0 HP. */
  died: boolean;
}

/**
 * Build the `NpcUpdate` to persist for a roster NPC given its current state, or
 * `null` when nothing would change. Called **live** by the runner as tokens are
 * revealed or fall — not at encounter conclusion.
 *
 * Two independent rules:
 * - **Death is a world fact** — `died` writes `status: "dead"` whether or not the
 *   party saw it. A hidden NPC that dies is recorded dead but never disclosed.
 * - **Reveal requires being seen** — only a `seen` NPC (token at `reveal_state
 *   "revealed"`) is added to the party's seen list, via a *widening* union on
 *   `player_visible_to` (never narrows an existing partial share) with
 *   `player_visible_fields` gaining `name`/`portrait`, plus `status` when the NPC
 *   is dead so the death shows.
 *
 * Idempotent: an NPC already dead + already fully revealed yields `null`, so
 * re-firing (or a manual pre-reveal by the DM) is a no-op. Reveal only applies
 * when there is a party to reveal to.
 */
export function buildNpcSyncUpdate(
  npc: NpcRecord,
  partyMemberIds: readonly string[],
  state: NpcSyncState,
): NpcUpdate | null {
  const update: NpcUpdate = {};

  if (state.died && npc.status !== "dead") update.status = "dead";
  const isDead = state.died || npc.status === "dead";

  // Reveal only NPCs the party has actually seen.
  if (state.seen && partyMemberIds.length > 0) {
    const visibleTo = new Set(npc.player_visible_to ?? []);
    const visibleBefore = visibleTo.size;
    for (const id of partyMemberIds) visibleTo.add(id);

    const fields = new Set(npc.player_visible_fields ?? []);
    const fieldsBefore = fields.size;
    for (const f of DEFAULT_REVEAL_FIELDS) fields.add(f);
    // A dead NPC's death only shows if `status` is among the shared fields.
    if (isDead) fields.add("status");

    if (visibleTo.size !== visibleBefore) update.player_visible_to = [...visibleTo];
    if (fields.size !== fieldsBefore) update.player_visible_fields = [...fields];
  }

  return Object.keys(update).length > 0 ? update : null;
}
