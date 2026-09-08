import { isSiteType } from "@/lib/locations/tiers";
import { LOCATION_TYPE_LABELS } from "@/types/location.types";
import type { LocationType } from "@/types/location.types";
import { ledgerVerbOf } from "./ledger";
import { describeQuestRouteEffect } from "./gates";
import { threadBadges } from "./threads";
import type {
  LootPlacementKind,
  QuestBeatVisibility,
  QuestConsequence,
  QuestConsequenceAction,
  QuestHeldPayoff,
  QuestRoutePayoff,
  QuestRuntimeChoice,
  QuestRuntimeJumpTarget,
  QuestThreadCursor,
} from "@/types/quest.types";

export interface RankedQuestJumpTarget extends QuestRuntimeJumpTarget {
  recentRank: number;
}

export interface QuestRunBranchChoice extends QuestRuntimeChoice {
  visibility: QuestBeatVisibility;
  presentationHint: string | null;
  prepGapCount: number;
  isVisited: boolean;
}

export interface SiteGraphLocation {
  id: string;
  parent_id: string | null;
  location_type: LocationType;
}

/**
 * The site (if any) the party's current position sits inside — walking up
 * ancestors from a room to its dungeon, or returning the position itself when
 * the party stands at the site's own entry rather than in a named room yet.
 *
 * Site position is a fact about the world (epic #780's Atlas), not about any
 * one quest's beat. Phase 3 (#797) shipped the join — a beat can stage at one
 * place via `quest_beats.staged_at_location_id` — but this function still
 * does not consume it: a party can be mid-dungeon on a chain that has never
 * staged a beat there at all, so the run cockpit reads
 * `campaigns.current_location_id` directly. Walking around a dungeon is not a
 * story event, so it must not depend on one being authored.
 *
 * Cycle-safe the same way `graph.ts` is: `seen` guards the ancestor walk so a
 * malformed `parent_id` chain cannot loop forever.
 */
export function resolveCurrentSite<T extends SiteGraphLocation>(
  partyLocationId: string | null,
  locations: readonly T[],
): T | null {
  if (!partyLocationId) return null;
  const byId = new Map(locations.map((location) => [location.id, location]));
  const start = byId.get(partyLocationId);
  if (!start) return null;
  if (isSiteType(start.location_type)) return start;

  const seen = new Set<string>([start.id]);
  let parent = start.parent_id ? (byId.get(start.parent_id) ?? null) : null;
  while (parent && !seen.has(parent.id)) {
    if (isSiteType(parent.location_type)) return parent;
    seen.add(parent.id);
    parent = parent.parent_id ? (byId.get(parent.parent_id) ?? null) : null;
  }
  return null;
}

/**
 * "The Sunken Vault · dungeon · 5 rooms · 2 explored" — the one-line summary
 * the run cockpit's "where the party is" panel leads with, so a DM reads the
 * site's shape without opening the Atlas.
 */
export function formatSiteSummary(
  site: { name: string; location_type: LocationType },
  roomCount: number,
  exploredCount: number,
): string {
  const typeLabel = LOCATION_TYPE_LABELS[site.location_type].toLowerCase();
  const roomWord = roomCount === 1 ? "room" : "rooms";
  return `${site.name} · ${typeLabel} · ${roomCount} ${roomWord} · ${exploredCount} explored`;
}

/**
 * Alt+→ means "advance when unambiguous," and unambiguous is a fact about the
 * ledger now, not about the graph: a route the gate holds shut does not count
 * as a candidate, so it cannot silently block the shortcut when it sits beside
 * the one route that is actually open, and two open routes must not let the
 * shortcut guess between them (#795).
 */
export function soleOpenOutgoingEdgeId(outgoing: QuestRuntimeChoice[]): string | null {
  const open = outgoing.filter((choice) => !choice.gate || choice.gate.is_open);
  return open.length === 1 ? open[0]!.edge_id : null;
}

/**
 * Jump moves *this* chain's cursor, so every candidate is a beat of the quest in
 * play and recency is the only axis left to rank on.
 *
 * The old current/side/campaign grouping — which sorted a quest's sub-quests
 * above unrelated ones — existed only because the picker spanned the whole
 * campaign. Reaching another quest is now navigation to its own Run surface
 * rather than a cursor write, so nothing here has other quests to sort. If the
 * nesting hint is wanted again it belongs on the quest switcher, where there are
 * actually several quests on offer.
 */
export function rankQuestJumpTargets(
  targets: QuestRuntimeJumpTarget[],
  recentBeatIds: string[],
): RankedQuestJumpTarget[] {
  const recent = new Map(recentBeatIds.map((id, index) => [id, index]));
  return targets
    .map((target) => ({ ...target, recentRank: recent.get(target.beat_id) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.recentRank - b.recentRank || a.beat_title.localeCompare(b.beat_title));
}

// ── The cockpit's thread bar and "Also open" rail (#853, story F) ──────────

/**
 * "paused at Confront Ser Vallis" — a sibling thread's own line in "Also
 * open". Distinct from `describeBeatRecordState` (`backfill.ts`), which
 * describes a *beat's* place in one thread's record; this describes a whole
 * *thread's* standing, for a rail that lists several threads side by side.
 */
export function describeThreadCursor(thread: QuestThreadCursor): string {
  const beat = thread.current_beat_title;
  switch (thread.runtime_status) {
    case "running": return beat ? `running at ${beat}` : "running";
    case "paused": return beat ? `paused at ${beat}` : "paused";
    case "waiting": return beat ? `waiting to converge at ${beat}` : "waiting to converge";
    case "ended": return "ended";
    case "idle":
    case null:
      return "not started";
  }
}

/**
 * The outgoing routes whose gate names this objective — the ledger's "gates
 * <target>" hint (`Main` board): a DM reading the objectives panel should see
 * not just that something is pending, but what taking it further unlocks.
 */
export function objectiveGateTargets(
  objectiveId: string,
  outgoing: readonly QuestRuntimeChoice[],
): string[] {
  return outgoing
    .filter((choice) => choice.gate?.objective_id === objectiveId)
    .map((choice) => choice.beat_title);
}

/**
 * The letter of another thread whose *current* beat carries the rule that
 * raised this objective — the ledger's "· Thread B" hint. A beat has no
 * stored owning thread (several threads can walk through the same beat over
 * time), so "another thread's beat" is read as "a beat a sibling thread is
 * standing on right now," the one fact actually available without a second
 * round trip through the transition log.
 */
export function objectiveThreadHint(
  objectiveId: string,
  consequences: readonly QuestConsequence[],
  threads: readonly QuestThreadCursor[],
  currentThreadId: string,
): string | null {
  const raisingBeatIds = new Set(
    consequences
      .filter((row) => row.action === "raise" && row.target_objective_id === objectiveId && row.on_beat_id)
      .map((row) => row.on_beat_id as string),
  );
  if (!raisingBeatIds.size) return null;
  const hit = threadBadges(threads).find((badge) =>
    badge.thread.id !== currentThreadId
    && !!badge.thread.current_beat_id
    && raisingBeatIds.has(badge.thread.current_beat_id));
  return hit?.letter ?? null;
}

/**
 * "reveal · Testify before the Guild" — a `choice` card's caption in "What
 * happens next" (`Runner` board): the route's first payoff, in the ledger's
 * own words when it moves the ledger, or the world-action sentence
 * (`describeQuestRouteEffect`) when it does something else. `null` when the
 * route carries no payoff at all — most routes don't, and a fallback like
 * "Continue" would claim there was always something to say.
 */
export function summarizeRoutePayoff(payoff: QuestRoutePayoff | undefined): string | null {
  if (!payoff) return null;
  const verb = ledgerVerbOf(payoff.action);
  const target = payoff.target_objective ?? payoff.target_npc ?? payoff.target_quest ?? null;
  if (verb) return target ? `${verb} · ${target}` : verb;
  return describeQuestRouteEffect({ action: payoff.action, objective: target, after_days: payoff.after_days });
}

const HELD_PAYOFF_ACTION_LABELS: Record<QuestConsequenceAction, string> = {
  raise: "Raises an objective",
  reveal: "Reveals an objective",
  complete: "Achieves an objective",
  fail: "Fails an objective",
  create_calendar_event: "Schedules a calendar event",
  send_broadcast: "Sends a broadcast",
  shift_npc_relationship: "Shifts an NPC's disposition",
  unlock_quest: "Unlocks a quest",
  grant_knowledge: "Grants knowledge",
  owe_favor: "Owes a favor",
  award_milestone: "Awards a milestone",
};

/**
 * A held consequence event's own label in the cockpit's Held payoff panel.
 * `QuestHeldPayoff` (unlike `QuestRoutePayoff`) carries only ids, not resolved
 * names — the event log was never joined for display, since the log's other
 * reader (`QuestBackfillPanel`) only ever needed the action — so this names
 * the action alone rather than guessing at a target it cannot see.
 */
export function describeHeldPayoff(payoff: QuestHeldPayoff): string {
  return HELD_PAYOFF_ACTION_LABELS[payoff.action];
}

/**
 * "currency · prepared" / "item · unclaimed once dispatched" — the Held
 * payoff panel's caption for a piece of loot still waiting on a drop.
 * Currency is inert once rolled (nothing left to claim once it's in a
 * player's pocket), so it reads as ready; an item or a chest stays open until
 * someone actually claims it in chat.
 */
export function describeHeldLoot(kind: LootPlacementKind): string {
  return kind === "currency" ? `${kind} · prepared` : `${kind} · unclaimed once dispatched`;
}

export interface SpineArrivalDetail {
  kind: string;
  reason: string | null;
  createdAt: string | null;
}

interface ArrivalTransitionRow {
  to_quest_id?: unknown;
  to_beat_id?: unknown;
  kind?: unknown;
  reason?: unknown;
  created_at?: unknown;
}

/**
 * The transition that carried the party onto a beat — the detail
 * `storySpine`'s own `note` field does not carry (it summarises ledger
 * deltas, not the visit itself), which `QuestRunStorySoFar` captions each row
 * with instead: "<kind> · session N" or "<kind> · <date>".
 *
 * `newest` picks the most recent arrival rather than the first — the current
 * beat's own row, since a re-visited beat's oldest arrival is not the one
 * that put the party there today.
 */
export function findBeatArrival(
  transitions: readonly ArrivalTransitionRow[],
  questId: string,
  beatId: string,
  newest = false,
): SpineArrivalDetail | null {
  const rows = transitions.filter((row) => row.to_quest_id === questId && row.to_beat_id === beatId);
  const row = newest ? rows[rows.length - 1] : rows[0];
  if (!row) return null;
  return {
    kind: typeof row.kind === "string" ? row.kind : "visit",
    reason: typeof row.reason === "string" ? row.reason : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
  };
}

const SESSION_NOTE_PATTERN = /session\s*#?\s*(\d+)/i;

/**
 * "session 24" when the arrival's reason names a session outright — the
 * shorthand DMs actually type when they pause mid-table — else the visit's
 * own date, so a row never claims a session number it cannot back up.
 */
export function describeSpineSession(
  detail: SpineArrivalDetail | null,
  formatDate: (iso: string) => string,
): string {
  if (!detail) return "";
  const match = detail.reason ? SESSION_NOTE_PATTERN.exec(detail.reason) : null;
  if (match) return `session ${match[1]}`;
  return detail.createdAt ? formatDate(detail.createdAt) : "";
}
