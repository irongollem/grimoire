import type { QuestBeat, QuestBeatEdge, QuestBeatVisibility } from "@/types/quest.types";

/** The three steps of what the players know of a beat, lowest first. */
export const VISIBILITY_STEPS = ["hidden", "rumored", "revealed"] as const satisfies readonly QuestBeatVisibility[];

export function visibilityRank(visibility: QuestBeatVisibility): 0 | 1 | 2 {
  switch (visibility) {
    case "hidden": return 0;
    case "rumored": return 1;
    case "revealed": return 2;
  }
}

export interface VisibilityFloorInput {
  beatId: string;
  /** Beats a live thread's cursor stands on. */
  partyBeatIds: ReadonlySet<string>;
  /** Beats the party has arrived at at any point. */
  reachedBeatIds: ReadonlySet<string>;
  edges: ReadonlyArray<Pick<QuestBeatEdge, "source_beat_id" | "target_beat_id">>;
  secret: QuestBeat["secret"];
}

/**
 * The lowest a DM may set a beat's visibility by hand: a beat the party has
 * stood on cannot be hidden again, and a non-secret beat one route ahead of
 * the party is at least rumored. The DM may raise it, never lower it past this.
 */
export function visibilityFloor(input: VisibilityFloorInput): QuestBeatVisibility {
  const { beatId, partyBeatIds, reachedBeatIds, edges, secret } = input;
  if (partyBeatIds.has(beatId) || reachedBeatIds.has(beatId)) return "revealed";
  if (!secret && edges.some((edge) => edge.target_beat_id === beatId && partyBeatIds.has(edge.source_beat_id))) return "rumored";
  return "hidden";
}

/** The beats a thread's cursor stands on, from the designer's per-thread map. */
export function partyBeatIdsOf(currentBeatIdByThread: Readonly<Record<string, string | null>>): Set<string> {
  return new Set(Object.values(currentBeatIdByThread).filter((id): id is string => id !== null));
}

/** Every beat the party has arrived at, from the quest's transitions. */
export function reachedBeatIdsOf(transitions: ReadonlyArray<{ to_beat_id: string | null }>): Set<string> {
  return new Set(transitions.map((transition) => transition.to_beat_id).filter((id): id is string => id !== null));
}

export interface AudienceMember {
  id: string;
  name: string;
}

/**
 * The words for who a beat is shown to. Null is the whole party; otherwise the
 * members' names ("Brannigan", "Brannigan and Edda") and, from three, "3 of 4".
 * Ids that match no current member still count towards the "n of m" form.
 */
export function audienceLabel(visibleTo: readonly string[] | null, members: readonly AudienceMember[]): string {
  if (visibleTo === null) return "Whole party";
  const names = visibleTo.flatMap((id) => members.find((member) => member.id === id)?.name ?? []);
  if (names.length === visibleTo.length && names.length === 1) return names[0];
  if (names.length === visibleTo.length && names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${visibleTo.length} of ${members.length}`;
}

/** The names behind a members-only audience, for a screen reader. */
export function audienceNames(visibleTo: readonly string[], members: readonly AudienceMember[]): string {
  return visibleTo.flatMap((id) => members.find((member) => member.id === id)?.name ?? []).join(", ");
}

/** Which members a quest is shown to, read from its beats: the whole party, only some, or no one yet. */
export type QuestAudience =
  | { kind: "hidden" }
  | { kind: "party" }
  | { kind: "members"; memberIds: string[] };

/**
 * A quest has no audience of its own: it follows its shown beats. Any shown beat
 * with no audience reaches the whole party and wins; otherwise the union of the
 * shown beats' audiences. Hidden beats say nothing until they are shown.
 */
export function questAudienceOf(beats: ReadonlyArray<Pick<QuestBeat, "visibility" | "visible_to">>): QuestAudience {
  const shown = beats.filter((beat) => beat.visibility !== "hidden");
  if (shown.length === 0) return { kind: "hidden" };
  if (shown.some((beat) => beat.visible_to === null)) return { kind: "party" };
  const ids = new Set(shown.flatMap((beat) => beat.visible_to ?? []));
  return { kind: "members", memberIds: [...ids] };
}

/**
 * The audience after the DM ticks or unticks one member. From the whole party,
 * unticking one leaves everyone else; ticking everyone returns to the whole
 * party (a member who joins later is then shown it too). The last ticked member
 * cannot be unticked: that would show the beat to no one, so it returns the
 * audience unchanged.
 */
export function toggleAudienceMember(visibleTo: readonly string[] | null, memberId: string, members: readonly AudienceMember[]): string[] | null {
  const allIds = members.map((member) => member.id);
  const current = visibleTo ?? allIds;
  const next = current.includes(memberId) ? current.filter((id) => id !== memberId) : [...current, memberId];
  if (next.length === 0) return visibleTo === null ? null : [...visibleTo];
  if (allIds.every((id) => next.includes(id))) return null;
  return next;
}
