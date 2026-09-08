import type { NpcRelationship } from "@/types/npc.types";
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
 * The **world actions** are everything else — what a beat does to the campaign
 * rather than to its own quest. One vocabulary for both ends of a consequence
 * (#794): `quest_triggers` fired *from* an objective becoming something, and
 * `quest_objective_effects` fired *to* one; `quest_consequences` replaces both.
 *
 * `shift_npc_relationship` (#831) and `unlock_quest` (#836) joined that family
 * rather than needing mechanisms of their own, and the reason is worth keeping:
 * both are caused by a beat, both can be delayed, and both land as durable
 * state on a row that already exists. A free-text "reward" field is what you
 * reach for when the system has no verb for the thing — the fix is usually to
 * add the verb.
 *
 * Note the family is **not** "rewards". A reward is positive by construction;
 * a relationship shift is signed — charm the lady and it goes up, embarrass
 * yourself trying and it goes down. Loot is the odd one out for always being a
 * gain, and it is not in this list at all: it lives in `loot_placements`,
 * because a consequence fires from the engine once per transition while loot
 * fires from a human once ever. See that table's comment before merging them.
 */
export type QuestConsequenceAction =
  | "raise"
  | "reveal"
  | "complete"
  | "fail"
  | "create_calendar_event"
  | "send_broadcast"
  | "shift_npc_relationship"
  | "unlock_quest"
  | "grant_knowledge"
  | "owe_favor"
  | "award_milestone";

export const QUEST_CONSEQUENCE_LEDGER_ACTIONS: readonly QuestConsequenceAction[] = ["raise", "reveal", "complete", "fail"];
export const QUEST_CONSEQUENCE_WORLD_ACTIONS: readonly QuestConsequenceAction[] = [
  "create_calendar_event",
  "send_broadcast",
  "shift_npc_relationship",
  "unlock_quest",
  "grant_knowledge",
  "owe_favor",
  "award_milestone",
];

/**
 * The reaction ladder, in order, as `shift_npc_relationship` walks it. Excludes
 * `unknown`, which is a member of `npc_relationship` but **not a rung**:
 * shifting from "we have not established this" is meaningless, and treating it
 * as `indifferent` would invent a stance the DM never set. A shift from
 * `unknown` is a no-op, decided in the migration rather than left to a caller.
 */
export const NPC_RELATIONSHIP_LADDER = ["hostile", "unfriendly", "indifferent", "friendly", "helpful"] as const;

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

/**
 * How far along the ladder to move, signed (#831). Relative rather than
 * absolute because a stance is *earned*: "set to helpful" throws away how it
 * got there, and composes worse when two beats both move the same NPC. Clamped
 * at both ends by the database, so a rule firing on an already-helpful NPC is a
 * no-op rather than a wrap round to hostile.
 */
export type RelationshipShiftConsequencePayload =
  | { step: number }
  /** The absolute form (migration `20260908210324`): "becomes helpful". A DM
   *  naming the stance outright, which the step cannot say and which is the
   *  only form that reaches an NPC still at `unknown`. */
  | { to: NpcStance };

/** A rung of the ladder — every stance but `unknown`, which nothing "becomes". */
export type NpcStance = (typeof NPC_RELATIONSHIP_LADDER)[number];

/**
 * The three verbs the design's diagnosis names directly (migration
 * `20260908210320`): "knowledge, favours and milestones have no verb, so they
 * end up as prose in `outcomes`." Same shape for all three — one line of text
 * — because what differs between them is *where* the row lands
 * (`player_journal_entries` / `npc_favors` / `party_milestones`), not what a
 * DM types.
 */
export interface KnowledgeConsequencePayload {
  text: string;
}

/** `owe_favor` also requires `target_npc_id` (`quest_consequences_npc_pair`,
 *  alongside `shift_npc_relationship`) — the favour is pinned to that NPC's page. */
export interface FavorConsequencePayload {
  text: string;
}

export interface MilestoneConsequencePayload {
  text: string;
}

export type QuestConsequenceActionPayload =
  | CalendarEventConsequencePayload
  | BroadcastConsequencePayload
  | RelationshipShiftConsequencePayload
  | KnowledgeConsequencePayload
  | FavorConsequencePayload
  | MilestoneConsequencePayload
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
  /** The NPC a `shift_npc_relationship` rule moves (#831). Set exactly when
   *  the action is that one, enforced by `quest_consequences_npc_pair`. */
  target_npc_id: string | null;
  /**
   * The quest an `unlock_quest` rule promotes out of `undiscovered` (#836).
   *
   * Deliberately **not** `parent_quest_id`: "unlocked by" and "child of" are
   * different relations. One trigger can legitimately open both a sequel and
   * something unrelated, so belonging stays an authoring choice made separately.
   */
  target_quest_id: string | null;
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
  /**
   * The undo record for the two actions added after this interface was written
   * — a disposition shift (#831) and a quest unlock (#836). Both store what the
   * value *was*, because both are relative moves: undoing "improve by two" has
   * to restore the stance it started from, not compute an inverse. Null for
   * every other action, and for a row logged before the action existed.
   *
   * They were missing here until the #825 review. Nothing broke, because the
   * one real reader (`useDueConsequences`) declares its own narrower row type
   * — but an audit-trail surface reading this interface would have been unable
   * to see either field, with the compiler agreeing it did not exist.
   */
  target_npc_id: string | null;
  previous_relationship: NpcRelationship | null;
  target_quest_id: string | null;
  previous_quest_status: QuestStatus | null;
  undone_at: string | null;
  seq: number;
  /**
   * Set when the DM held this payoff back in the Advance dialog instead of
   * letting it fire (#853). Cleared when it is fired from the log. The three
   * rows a fired verb can point at — never more than one of the three set —
   * are the destinations `grant_knowledge`/`owe_favor`/`award_milestone`
   * write to; a row logged before those verbs existed, or logged for any
   * other action, carries all three `null`.
   */
  held_at: string | null;
  journal_entry_id: string | null;
  favor_id: string | null;
  milestone_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * What an NPC owes the party (#853, `npc_favors`). Written by the `owe_favor`
 * consequence or by hand on the NPC sheet; settled, never deleted, once
 * repaid — `settled_at` is the record that it happened, not a row to clear.
 * Lives here rather than in `npc.types.ts`: this is quest payoff pinned to an
 * NPC, the same reason `QuestConsequenceEvent` lives here and not on the NPC.
 */
export interface NpcFavor {
  id: string;
  campaign_id: string;
  npc_id: string;
  quest_id: string | null;
  text: string;
  source_event_id: string | null;
  settled_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type NpcFavorInsert = Omit<NpcFavor, "id" | "created_at" | "updated_at" | "settled_at" | "created_by"> & {
  created_by?: string | null;
};

/**
 * A milestone the party earned — renown, a promise kept, a threshold crossed
 * (#853, `party_milestones`). Written by the `award_milestone` consequence or
 * by hand on the party screen. Lives here rather than in `party.types.ts` for
 * the same reason `NpcFavor` lives here: it is quest payoff, not party state.
 */
export interface PartyMilestone {
  id: string;
  campaign_id: string;
  quest_id: string | null;
  text: string;
  source_event_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type PartyMilestoneInsert = Omit<PartyMilestone, "id" | "created_at" | "updated_at" | "created_by"> & {
  created_by?: string | null;
};

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

/** How a beat receives several arriving threads (#853). */
export type QuestConvergeMode = "any" | "all";

export interface QuestBeat {
  id: string;
  quest_id: string;
  campaign_id: string;
  title: string;
  dm_content: string | null;
  read_aloud: string | null;
  /**
   * `outcomes`/`consequences` are gone (migration `20260908210320`): a beat's
   * prose columns for "what usually happens" and "what changes later" folded
   * into this field as trailing paragraphs, and the three world verbs
   * (`grant_knowledge`/`owe_favor`/`award_milestone`) replace the part that
   * was actually a mechanism rather than guidance.
   */
  how_it_plays: string | null;
  rumor_text: string | null;
  reveal_text: string | null;
  visibility: QuestBeatVisibility;
  kind: QuestBeatKind;
  presentation_hint: string | null;
  /**
   * `any`: every arriving thread proceeds on its own. `all`: the beat holds
   * each arriving thread until every incoming route has been walked, then
   * merges them into one cursor (#853's converge beat).
   */
  converge_mode: QuestConvergeMode;
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

/** `choice` moves the cursor (its siblings become unreachable); `parallel`
 *  spawns a thread and leaves the current cursor alone. Gates apply to both. */
export type QuestRouteKind = "choice" | "parallel";

export interface QuestBeatEdge {
  id: string;
  quest_id: string;
  campaign_id: string;
  source_beat_id: string;
  target_beat_id: string;
  created_by: string | null;
  created_at: string;
  route_kind: QuestRouteKind;
  /** The label a `parallel` route gives the thread it opens — shown to the DM
   *  and on the player thread. Null on a `choice`. */
  thread_label: string | null;
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
 * One thread's status (#853). `live`: has a running/paused cursor. `waiting`:
 * parked at a converge-all beat until every incoming route has been walked.
 * `merged`: folded into another thread at such a beat. `closed`: ended by the
 * DM or by the quest.
 */
export type QuestThreadStatus = "live" | "waiting" | "closed" | "merged";

/**
 * One live cursor of a quest (#853, `quest_threads`). A quest holds as many as
 * the story has open at once; a parallel route spawns one, a converge-all beat
 * merges them. Every quest that predates threads has exactly one, named "Main".
 */
export interface QuestThread {
  id: string;
  campaign_id: string;
  quest_id: string;
  label: string;
  status: QuestThreadStatus;
  /** The parallel route that opened this thread, when one did. Null for a
   *  thread opened by hand or for the Main thread. */
  opened_by_edge_id: string | null;
  parent_thread_id: string | null;
  merged_into_thread_id: string | null;
  created_by: string | null;
  created_at: string;
  closed_at: string | null;
  updated_at: string;
}

export type QuestThreadInsert = Omit<QuestThread, "id" | "created_by" | "created_at" | "closed_at" | "updated_at">;

/**
 * One quest's live cursor. Keyed `(campaign_id, quest_id, thread_id)`: a party
 * is routinely mid-progress on several chains at once — a main quest suspended
 * while a side chain runs, two quests converging on the same cave, or now a
 * single quest running several threads at once (#853) — so "where the party
 * is" is a set of positions, not one, and not even one per quest.
 */
export interface QuestRuntimeState {
  campaign_id: string;
  quest_id: string;
  thread_id: string;
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

/** `waiting`: parked at a converge-all beat. Not `paused` — the DM did not
 *  stop it, the story did, and it resumes on its own when the last thread
 *  arrives (#853). */
export type QuestRuntimeStatus = "idle" | "running" | "paused" | "waiting" | "ended";
export type QuestRuntimeCommand = "start" | "advance" | "previous" | "jump" | "return" | "improv" | "pause" | "resume" | "end";
export type QuestTransitionKind = "enter" | "forward" | "previous" | "jump" | "return" | "improv" | "pause" | "resume" | "end" | "assert";

/** A place in one chain. The quest is the cursor row's own key, so an entry
 * carries only the beat — a quest_id inside it could only ever disagree. */
export interface QuestRuntimePosition {
  beat_id: string;
}

/** The place a route leads, when it leads anywhere physical — joined
 *  server-side so a branch card can say "opens onto a site" without a
 *  second round trip. */
export interface QuestRouteSite {
  location_id: string;
  name: string;
  room_count: number;
}

/**
 * One payoff a route carries, read from `quest_consequences` the same way
 * `QuestRouteEffect` always has — but resolved to names, not just ids, and
 * carrying `on_edge` so the Advance dialog can tell a route's own payoff from
 * one that fires on arrival at the beat it leads to.
 */
export interface QuestRoutePayoff {
  consequence_id: string;
  action: QuestConsequenceAction;
  target_objective_id: string | null;
  target_objective: string | null;
  target_npc_id: string | null;
  target_npc: string | null;
  target_quest_id: string | null;
  target_quest: string | null;
  action_payload: QuestConsequenceActionPayload;
  after_days: number;
  on_edge: boolean;
}

/** Loot a route's destination beat holds, offered in the Advance dialog
 *  alongside its payoff so a DM decides both in one place. */
export interface QuestRouteLoot {
  id: string;
  kind: LootPlacementKind;
  label: string;
  quantity: number;
  item_id: string | null;
}

export interface QuestRuntimeChoice {
  edge_id: string;
  quest_id: string;
  beat_id: string;
  beat_title: string;
  beat_kind: string;
  gate: QuestRouteGate | null;
  effects: QuestRouteEffect[];
  route_kind: QuestRouteKind;
  thread_label: string | null;
  converge_mode: QuestConvergeMode;
  site: QuestRouteSite | null;
  payoff: QuestRoutePayoff[];
  loot: QuestRouteLoot[];
}

export interface QuestRuntimeJumpTarget {
  quest_id: string;
  beat_id: string;
  quest_title: string;
  beat_title: string;
  beat_kind: string;
  is_improvised: boolean;
}

/** A chain the party currently has open. Running first, then paused. Now one
 *  row per thread (#853) — `sibling_count` says how many other threads this
 *  quest currently holds, so a list of chains can say "and 2 more" without a
 *  second query. */
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
  thread_id: string;
  thread_label: string;
  thread_status: QuestThreadStatus;
  sibling_count: number;
}

/** One thread as `get_quest_runtime_context` lists it under `threads[]`: the
 *  thread row plus where it currently stands, so a thread switcher needs no
 *  second query per thread. `runtime_status` is null for a thread with no
 *  cursor row yet (freshly opened, not yet started). */
export interface QuestThreadCursor extends QuestThread {
  current_beat_id: string | null;
  current_beat_title: string | null;
  runtime_status: QuestRuntimeStatus | null;
  version: number;
}

/**
 * A payoff the DM held back in the Advance dialog instead of letting it fire
 * (#853) — logged (`quest_consequence_events.held_at`) but not performed.
 * Offered back later so the DM can fire it from the log when the story
 * catches up to it.
 */
export interface QuestHeldPayoff {
  event_id: string;
  consequence_id: string | null;
  action: QuestConsequenceAction;
  target_objective_id: string | null;
  target_npc_id: string | null;
  target_quest_id: string | null;
  action_payload: QuestConsequenceActionPayload;
  after_days: number;
  held_at: string;
  beat_id: string | null;
  beat_title: string | null;
}

export interface QuestRuntimeContext {
  state: QuestRuntimeState | null;
  current: QuestBeat | null;
  previous: QuestRuntimePosition | null;
  outgoing: QuestRuntimeChoice[];
  return_target: QuestRuntimePosition | null;
  path_so_far: Array<Record<string, unknown>>;
  /** The thread this context was fetched for. */
  thread: QuestThread;
  /** Every thread this quest currently holds, so a thread switcher never
   *  needs a second query. */
  threads: QuestThreadCursor[];
  /** Payoffs held back rather than fired, still waiting on the log. */
  held: QuestHeldPayoff[];
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
  /** The thread that walked this transition. Null for an `assert` row, which
   *  carries no cursor at all, and for a row logged before threads existed. */
  thread_id: string | null;
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
  /**
   * The thread this beat belongs to on the player journal (#850 story J): the
   * thread whose transition first walked into it, or — for a beat foreshadowed
   * ahead of the party — the live thread whose cursor can still reach it by
   * walking edges forward. A thread with no revealed beat of its own folds
   * into "Main" here, so an opened-in-secret layer never gets its own column
   * before the party has heard the first word of it. Always populated: the
   * RPC's own Main thread is the fallback of last resort.
   */
  thread_id: string;
  /** The label of {@link PlayerQuestBeat.thread_id} — players see this, never
   *  a thread letter (those are a DM-cockpit device, `src/lib/quests/threads.ts`). */
  thread_label: string;
  /** True when a live (non-closed, non-merged) thread's cursor stands exactly
   *  on this beat right now — the "happening now" marker. */
  is_current: boolean;
  /**
   * What this beat paid out, in the order it happened: knowledge the party
   * learned here (a `grant_knowledge` rule's journal entry) and loot dropped
   * from here, once dispatched. Always `[]` on a rumored beat — a payoff is
   * something that happened, and a rumored beat hasn't happened yet.
   */
  payoff: PlayerQuestBeatPayoffEntry[];
}

/** One knowledge grant the party read out of this beat's transitions
 *  (`grant_knowledge` → `player_journal_entries`, #852). */
export interface PlayerQuestBeatKnowledgePayoff {
  kind: "knowledge";
  text: string;
}

/**
 * One loot placement dispatched from this beat (`loot_placements`, #830),
 * collapsed from `get_loot_placements`' four-rung delivery ladder
 * (held/message_removed/claimed/partially_claimed/chat) to the two states a
 * player acts on. `claimed_by` is populated only once `state` is `"claimed"`
 * — while a placement is still `claimable`, who (if anyone) has claimed part
 * of it is chat's story to tell, not the journal's. `message_id` is the
 * `campaign_messages` row to open for the claim, when the chat surface wires
 * up a jump-to-message (`ChatPanelContent`'s existing `focusMessageId` prop).
 */
export interface PlayerQuestBeatLootPayoff {
  kind: "loot";
  label: string;
  state: "claimable" | "claimed";
  claimed_by: string | null;
  message_id: string | null;
}

export type PlayerQuestBeatPayoffEntry = PlayerQuestBeatKnowledgePayoff | PlayerQuestBeatLootPayoff;

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
  | "check"
  | "sound"
  | "audio_scene"
  | "playlist"
  | "note"
  | "handout";

/**
 * Metadata for a `check`-type attachment. Unlike every other attachment type,
 * `ref_id` is the stable literal `"check"` rather than a row id — the check
 * carries its own data instead of pointing at one, so there is nothing to look
 * up and nothing that can go missing (#850 story K).
 */
export interface QuestCheckAttachmentMetadata {
  skill: string;
  dc: number;
  contested_by?: string | null;
  note?: string | null;
}

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

export type LootPlacementKind = "item" | "currency" | "loot_chest";
export type LootPlacementSource = "prepared" | "quest_reward" | "encounter_loot" | "loot_table";
export type LootPlacementDeliveryState = "held" | "chat" | "partially_claimed" | "claimed" | "message_removed";

/**
 * Loot a beat or a room *holds*, until a DM drops it to chat (#830). Renamed
 * from `QuestBeatLoot`/`quest_beat_loot` when rooms gained the same verb —
 * a row has exactly one home: `beat_id` + `quest_id` together, or
 * `location_id` alone (`loot_placements_one_home`,
 * `loot_placements_beat_pair` in the database). Never assume a beat home; a
 * `location_id` row deliberately carries `beat_id`/`quest_id` as `null`.
 */
export interface LootPlacement {
  id: string;
  beat_id: string | null;
  quest_id: string | null;
  /** The room that holds this loot, exclusive with `beat_id` (#830). A DM
   *  standing in a room drops it directly; no quest cursor is involved. */
  location_id: string | null;
  campaign_id: string;
  kind: LootPlacementKind;
  item_id: string | null;
  quantity: number;
  label: string;
  payload: Record<string, unknown>;
  source_type: LootPlacementSource;
  source_id: string | null;
  sort_order: number;
  dispatch_message_id: string | null;
  dispatched_at: string | null;
  delivery_state: LootPlacementDeliveryState;
  quantity_remaining: number;
  claimed_by_names: string[];
  handed_out_this_session: boolean;
}

export type LootPlacementInsert = Omit<
  LootPlacement,
  "id" | "dispatch_message_id" | "dispatched_at" | "delivery_state" | "quantity_remaining" | "claimed_by_names" | "handed_out_this_session" | "location_id"
> & Partial<Pick<LootPlacement, "quantity" | "label" | "payload" | "source_type" | "source_id" | "sort_order" | "location_id">>;

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

