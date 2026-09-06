import type { AiProvenance } from "@/ai/provenance";

export type QuestStatus =
  | "undiscovered"
  | "rumor"
  | "active"
  | "completed"
  | "failed";

export const QUEST_STATUSES: QuestStatus[] = [
  "undiscovered",
  "rumor",
  "active",
  "completed",
  "failed",
];

export const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  undiscovered: "Undiscovered",
  rumor: "Rumor",
  active: "Active",
  completed: "Completed",
  failed: "Failed",
};

export const QUEST_STATUS_COLORS: Record<QuestStatus, string> = {
  undiscovered: "#9ca3af",
  rumor: "#ca8a04",
  active: "#16a34a",
  completed: "#0284c7",
  failed: "#dc2626",
};

export interface Quest {
  id: string;
  user_id: string;
  campaign_id: string | null;
  parent_quest_id: string | null;
  title: string;
  /**
   * The blurb that lets you tell what a quest is without opening it. One
   * line, by CHECK (`quests_summary_is_one_line`, migration `20260906160921`)
   * — not prose, which belongs on a beat. Shown on the DM quest card, the
   * kanban board, the player quest log and the player quest page, and matched
   * by quest search. Player-facing: never put a DM secret here (#799). See
   * `QUEST_SUMMARY_MAX` (`src/lib/quests/summary.ts`) for the enforced cap.
   */
  summary: string | null;
  status: QuestStatus;
  giver_npc_id: string | null;
  location_id: string | null;
  tags: string[];
  player_visible_to: string[];
  started_at: string | null;
  resolved_at: string | null;
  ai_provenance?: AiProvenance | null;
  created_at: string;
  updated_at: string;
}

export type QuestInsert = Omit<Quest, "id" | "user_id" | "created_at" | "updated_at">;
export type QuestUpdate = Partial<QuestInsert>;

/**
 * `dormant` -> `pending` (raised) -> `complete` | `failed`, with `dormant`
 * reachable again from `pending` when a branch closes an objective off
 * without resolving it. A `dormant` objective belongs to a branch the party
 * has not been sent down yet — it is a stored fact the ledger carries, not a
 * derived "not reachable from here" (see migration `20260905101454`), and the
 * database refuses `dormant` + `is_player_visible` together.
 */
export type QuestObjectiveStatus = "dormant" | "pending" | "complete" | "failed";

export interface QuestObjective {
  id: string;
  quest_id: string;
  description: string;
  /**
   * Replaces the old `is_done` boolean, which could not say that an objective
   * *failed* — the one outcome a branching story exists to produce.
   */
  status: QuestObjectiveStatus;
  is_player_visible: boolean;
  sort_order: number;
}

/**
 * `raise` lifts an objective out of `dormant` and does nothing to one already
 * settled. It is deliberately not `reveal`: raising makes the objective live
 * for the DM, revealing tells the party — an objective is routinely one
 * without the other.
 *
 * `create_calendar_event` / `send_broadcast` are the two world actions —
 * everything else is a ledger verb. One vocabulary for both ends of a
 * consequence (#794): `quest_triggers` fired *from* an objective becoming
 * something, and `quest_objective_effects` fired *to* one; `quest_consequences`
 * replaces both.
 */
export type QuestConsequenceAction = "raise" | "reveal" | "complete" | "fail" | "create_calendar_event" | "send_broadcast";

export const QUEST_CONSEQUENCE_LEDGER_ACTIONS: readonly QuestConsequenceAction[] = ["raise", "reveal", "complete", "fail"];
export const QUEST_CONSEQUENCE_WORLD_ACTIONS: readonly QuestConsequenceAction[] = ["create_calendar_event", "send_broadcast"];

/** The three statuses a `quest_consequences.on_objective_status` condition can
 *  name — never `dormant`, which nothing "becomes" on purpose (it is the
 *  starting state a `raise` rule lifts an objective out of). */
export type QuestConsequenceObjectiveStatus = "pending" | "complete" | "failed";
export const QUEST_CONSEQUENCE_OBJECTIVE_STATUSES: readonly QuestConsequenceObjectiveStatus[] = ["pending", "complete", "failed"];

export interface CalendarEventConsequencePayload {
  title: string;
  event_type: string;
  description?: string;
}

export interface BroadcastConsequencePayload {
  message: string;
}

export type QuestConsequenceActionPayload =
  | CalendarEventConsequencePayload
  | BroadcastConsequencePayload
  | Record<string, never>;

/**
 * One rule: when this becomes that, do this. Exactly one condition family is
 * set — `on_beat_id` (arrival), `on_edge_id` (taking that branch),
 * `on_objective_id` + `on_objective_status` (an objective became that status),
 * or `on_quest_settled` (the whole ledger has nothing pending left) — enforced
 * by `quest_consequences_one_condition` in the database, not here.
 *
 * Replaces `quest_objective_effects` (event → state) and `quest_triggers`
 * (state → world action), which were two ends of the same sentence and never
 * composed (#794). See `supabase/migrations/20260905215424_one_consequence_mechanism.sql`.
 */
export interface QuestConsequence {
  id: string;
  quest_id: string;
  on_beat_id: string | null;
  on_edge_id: string | null;
  on_objective_id: string | null;
  on_objective_status: QuestConsequenceObjectiveStatus | null;
  on_quest_settled: boolean;
  /** In-world days between the condition firing and the action performing.
   *  Zero performs inside the same transaction as the condition. Honoured for
   *  the two world actions; a ledger verb applies immediately regardless —
   *  see `private.apply_quest_consequences`. */
  after_days: number;
  action: QuestConsequenceAction;
  /** Required for a ledger verb, forbidden for a world action — the other
   *  objective a ledger verb moves. Never the same objective named by
   *  `on_objective_id` (no self-reference). */
  target_objective_id: string | null;
  action_payload: QuestConsequenceActionPayload;
  created_at: string;
  updated_at: string;
}

export type QuestConsequenceInsert = Omit<QuestConsequence, "id" | "created_at" | "updated_at">;

/**
 * The append-only log of every consequence that fired: `quest_consequence_events`.
 * DM-only (`private.is_campaign_dm`) — a player's objective/verb/previous-visibility
 * history is not theirs to read (see #798 for the player-facing projection).
 *
 * A row with `performed_at is null and undone_at is null and after_days > 0` is
 * waiting for its in-world date — the database logs it and names the day it
 * fired on (`fires_on_year/month/day`); the client, the one place per-calendar
 * arithmetic lives (`src/lib/calendar/dayMath.ts`), decides when
 * `fires_on + after_days` has arrived and calls `perform_quest_consequence`.
 * See `useDueConsequences`.
 */
export interface QuestConsequenceEvent {
  id: string;
  campaign_id: string;
  quest_id: string;
  transition_id: string;
  consequence_id: string | null;
  action: QuestConsequenceAction;
  target_objective_id: string | null;
  previous_status: QuestObjectiveStatus | null;
  previous_is_player_visible: boolean | null;
  action_payload: QuestConsequenceActionPayload;
  after_days: number;
  fires_on_year: number | null;
  fires_on_month: number | null;
  fires_on_day: number | null;
  performed_at: string | null;
  performed_on_year: number | null;
  performed_on_month: number | null;
  performed_on_day: number | null;
  calendar_event_id: string | null;
  message_id: string | null;
  undone_at: string | null;
  seq: number;
  created_at: string;
  updated_at: string;
}

export type QuestObjectiveInsert = Omit<QuestObjective, "id">;
export type QuestObjectiveUpdate = Partial<
  Omit<QuestObjective, "id" | "quest_id">
>;

export type QuestBeatVisibility = "hidden" | "rumored" | "revealed";
export type QuestBeatKind = "combat" | "social" | "explore" | "discovery" | "neutral" | (string & {});

/**
 * The kinds offered in the UI. `QuestBeatKind` stays open because generated and
 * imported beats legitimately arrive with their own word for what a scene is,
 * and silently rewriting that to "neutral" would lose the author's intent — so
 * an editor showing this list must still keep a value it does not recognise.
 */
export const QUEST_BEAT_KINDS = ["neutral", "combat", "social", "explore", "discovery"] as const;

export const QUEST_BEAT_KIND_LABELS: Record<(typeof QUEST_BEAT_KINDS)[number], string> = {
  neutral: "Neutral",
  combat: "Combat",
  social: "Social",
  explore: "Explore",
  discovery: "Discovery",
};

export interface QuestBeat {
  id: string;
  quest_id: string;
  campaign_id: string;
  title: string;
  dm_content: string | null;
  read_aloud: string | null;
  how_it_plays: string | null;
  outcomes: string | null;
  consequences: string | null;
  rumor_text: string | null;
  reveal_text: string | null;
  visibility: QuestBeatVisibility;
  kind: QuestBeatKind;
  presentation_hint: string | null;
  /**
   * Where this beat happens. Singular: a beat is one event in one place; a
   * scene spanning two places is two beats. Any location qualifies — being a
   * *site* with a floor plan is what unlocks the run cockpit's room surface,
   * not a precondition for naming the place (`isSiteType`, `lib/locations/tiers.ts`).
   * Replaces the `location_set` attachment and its unenforceable
   * `metadata.room_ids` list (#797, migration `20260906113143`).
   */
  staged_at_location_id: string | null;
  canvas_x: number;
  canvas_y: number;
  is_improvised: boolean;
  improv_reviewed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type QuestBeatInsert = Omit<QuestBeat, "id" | "created_by" | "created_at" | "updated_at" | "staged_at_location_id"> & {
  id?: string;
  /** Omit to take the column default of null — stage it after creation. */
  staged_at_location_id?: string | null;
};
export type QuestBeatUpdate = Partial<Omit<QuestBeatInsert, "quest_id" | "campaign_id">>;

export interface QuestBeatEdge {
  id: string;
  quest_id: string;
  campaign_id: string;
  source_beat_id: string;
  target_beat_id: string;
  created_by: string | null;
  created_at: string;
  /**
   * Not a column here — `quest_beat_edge_gates` is a separate child table so
   * that deleting an objective can drop the gate and keep the route, which a
   * `set null` on two columns could not do without a trigger (#795).
   * Populated client-side by `deriveQuestRouteGates`, joining that table
   * against `quest_objectives`: `undefined` before that join has run, `null`
   * once it has and no gate exists. Absence is real "always open," never a
   * coerced default.
   */
  gate?: QuestRouteGate | null;
}

export type QuestBeatEdgeInsert = Omit<QuestBeatEdge, "id" | "created_by" | "created_at" | "gate">;

/**
 * This route is open while its objective stands in the given status; absent
 * means always open. A child row rather than columns on the edge (#795): the
 * FK cascades when the objective is deleted, dropping the gate and keeping
 * the route.
 */
export interface QuestBeatEdgeGate {
  edge_id: string;
  quest_id: string;
  campaign_id: string;
  objective_id: string;
  status: QuestConsequenceObjectiveStatus;
  created_at: string;
  updated_at: string;
}

export type QuestBeatEdgeGateInsert = Omit<QuestBeatEdgeGate, "created_at" | "updated_at">;

/**
 * A gate as read for display: the objective it names, the status the route
 * needs, the status the objective is actually in, and whether that makes the
 * route open right now. Shared by Build mode (`QuestBeatEdge.gate`, joined
 * client-side against `quest_objectives` by `deriveQuestRouteGates`) and Run
 * mode (`QuestRuntimeChoice.gate`, joined server-side by
 * `get_quest_runtime_context`) so both surfaces read the same fields.
 */
export interface QuestRouteGate {
  objective_id: string;
  objective: string;
  required_status: QuestConsequenceObjectiveStatus;
  current_status: QuestObjectiveStatus;
  is_open: boolean;
}

/**
 * What taking a route does — read from `quest_consequences.on_edge_id`
 * (#794), never stored on the edge itself (#795). `objective` is null for a
 * world action, which has no `target_objective_id`.
 */
export interface QuestRouteEffect {
  action: QuestConsequenceAction;
  objective: string | null;
  after_days: number;
}

/**
 * One quest's live cursor. Keyed `(campaign_id, quest_id)`: a party is routinely
 * mid-progress on several chains at once — a main quest suspended while a side
 * chain runs, or two quests converging on the same cave — so "where the party
 * is" is a set of positions, not one.
 */
export interface QuestRuntimeState {
  campaign_id: string;
  quest_id: string;
  current_beat_id: string | null;
  return_stack: QuestRuntimePosition[];
  visit_stack: QuestRuntimePosition[];
  visit_index: number;
  status: QuestRuntimeStatus;
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type QuestRuntimeStatus = "idle" | "running" | "paused" | "ended";
export type QuestRuntimeCommand = "start" | "advance" | "previous" | "jump" | "return" | "improv" | "pause" | "resume" | "end";
export type QuestTransitionKind = "enter" | "forward" | "previous" | "jump" | "return" | "improv" | "pause" | "resume" | "end" | "assert";

/** A place in one chain. The quest is the cursor row's own key, so an entry
 * carries only the beat — a quest_id inside it could only ever disagree. */
export interface QuestRuntimePosition {
  beat_id: string;
}

export interface QuestRuntimeChoice {
  edge_id: string;
  quest_id: string;
  beat_id: string;
  beat_title: string;
  beat_kind: string;
  gate: QuestRouteGate | null;
  effects: QuestRouteEffect[];
}

export interface QuestRuntimeJumpTarget {
  quest_id: string;
  beat_id: string;
  quest_title: string;
  beat_title: string;
  beat_kind: string;
  is_improvised: boolean;
}

/** A chain the party currently has open. Running first, then paused. */
export interface CampaignLiveQuest {
  quest_id: string;
  quest_title: string;
  quest_status: QuestStatus;
  beat_id: string;
  beat_title: string;
  beat_kind: string;
  runtime_status: QuestRuntimeStatus;
  version: number;
  updated_at: string;
}

export interface QuestRuntimeContext {
  state: QuestRuntimeState | null;
  current: QuestBeat | null;
  previous: QuestRuntimePosition | null;
  outgoing: QuestRuntimeChoice[];
  return_target: QuestRuntimePosition | null;
  path_so_far: Array<Record<string, unknown>>;
}

export interface QuestBeatTransition {
  id: string;
  campaign_id: string;
  from_quest_id: string | null;
  from_beat_id: string | null;
  to_quest_id: string | null;
  to_beat_id: string | null;
  transition_kind: QuestTransitionKind;
  reason: string | null;
  runtime_version: number;
  from_quest_title: string | null;
  from_beat_title: string | null;
  to_quest_title: string | null;
  to_beat_title: string | null;
  provenance: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface PlayerQuestBeat {
  id: string;
  quest_id: string;
  campaign_id: string;
  visibility: Exclude<QuestBeatVisibility, "hidden">;
  kind: QuestBeatKind;
  presentation_hint: string | null;
  player_text: string | null;
  /**
   * Position in the authored flow — depth along the longest path from the
   * quest's opening beat, with the quest-level overview at -1. It is the only
   * thing players learn about the graph: the edges themselves stay DM-only, so
   * this says how far in a moment sits without saying what leads where.
   */
  story_order: number;
  attachments: PlayerQuestBeatAttachmentSummary[];
  visits: PlayerQuestBeatVisitSummary[];
  updated_at: string;
  /**
   * Where this beat happens (`quest_beats.staged_at_location_id`, #797),
   * mirrored to players by `get_player_visible_quest_beats` (#798). Populated
   * only when `visibility === "revealed"` — a rumored beat's staging would
   * pin a scene on the map before the party has had it, so the RPC withholds
   * it server-side and this is `null` on every rumored row. `null` on a
   * revealed row is also normal: most beats don't stage anywhere at all.
   */
  staged_at_location_id: string | null;
}

export interface PlayerQuestBeatAttachmentSummary {
  attachment_id: string;
  type: QuestRefType;
  ref_id: string;
  label?: string;
  role?: string;
}

export interface PlayerQuestBeatVisit {
  visit_id: string;
  beat_id: string;
  quest_id: string;
  visibility: Exclude<QuestBeatVisibility, "hidden">;
  player_text: string | null;
  visited_at: string;
}

export interface PlayerQuestBeatVisitSummary {
  visit_id: string;
  visited_at: string;
}

export type QuestBeatAttachmentType =
  | "encounter"
  | "npc"
  | "faction"
  | "item"
  | "monster"
  | "sound"
  | "audio_scene"
  | "playlist"
  | "note"
  | "handout";

export interface QuestBeatAttachment {
  id: string;
  beat_id: string;
  quest_id: string;
  campaign_id: string;
  attachment_type: QuestBeatAttachmentType;
  ref_id: string;
  role: string;
  is_required: boolean;
  metadata: Record<string, unknown>;
  sort_order: number;
  created_by: string | null;
  created_at: string;
}

export type QuestBeatAttachmentInsert = Omit<
  QuestBeatAttachment,
  "id" | "created_by" | "created_at" | "role" | "is_required" | "metadata" | "sort_order"
> & Partial<Pick<QuestBeatAttachment, "role" | "is_required" | "metadata" | "sort_order">>;

export interface QuestBeatAttachmentSummary extends QuestBeatAttachment {
  label: string;
  target_exists: boolean;
  prep_gap: boolean;
  compact_detail: string | null;
  full_editor_to: string | null;
}

export type QuestBeatLootKind = "item" | "currency" | "loot_chest";
export type QuestBeatLootSource = "prepared" | "quest_reward" | "encounter_loot";
export type QuestBeatLootDeliveryState = "held" | "chat" | "partially_claimed" | "claimed" | "message_removed";

export interface QuestBeatLoot {
  id: string;
  beat_id: string;
  quest_id: string;
  campaign_id: string;
  kind: QuestBeatLootKind;
  item_id: string | null;
  quantity: number;
  label: string;
  payload: Record<string, unknown>;
  source_type: QuestBeatLootSource;
  source_id: string | null;
  sort_order: number;
  dispatch_message_id: string | null;
  dispatched_at: string | null;
  delivery_state: QuestBeatLootDeliveryState;
  quantity_remaining: number;
  claimed_by_names: string[];
  handed_out_this_session: boolean;
}

export type QuestBeatLootInsert = Omit<
  QuestBeatLoot,
  "id" | "dispatch_message_id" | "dispatched_at" | "delivery_state" | "quantity_remaining" | "claimed_by_names" | "handed_out_this_session"
> & Partial<Pick<QuestBeatLoot, "quantity" | "label" | "payload" | "source_type" | "source_id" | "sort_order">>;

export interface RewardCurrencyPool {
  id: string;
  label: string;
  pp: number;
  gp: number;
  ep: number;
  sp: number;
  cp: number;
}

export type QuestRefType = "npc" | "location" | "monster" | "item" | "encounter" | "faction";

export const QUEST_REF_TYPE_LABELS: Record<QuestRefType, string> = {
  npc: "NPC",
  location: "Location",
  monster: "Monster",
  item: "Item",
  encounter: "Encounter",
  faction: "Faction",
};

export interface QuestRef {
  id: string;
  quest_id: string;
  ref_type: QuestRefType;
  ref_id: string;
  is_player_visible: boolean;
}

export type QuestRefInsert = Omit<QuestRef, "id" | "is_player_visible"> & {
  is_player_visible?: boolean;
};

