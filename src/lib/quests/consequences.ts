import type {
  BroadcastConsequencePayload,
  ClockTickConsequencePayload,
  CalendarEventConsequencePayload,
  FavorConsequencePayload,
  KnowledgeConsequencePayload,
  MilestoneConsequencePayload,
  QuestConsequence,
  QuestConsequenceAction,
  QuestConsequenceActionPayload,
  RelationshipShiftConsequencePayload,
} from "@/types/quest.types";
import { NPC_RELATIONSHIP_LADDER, QUEST_CONSEQUENCE_LEDGER_ACTIONS, type NpcStance } from "@/types/quest.types";
import { NPC_RELATIONSHIP_LABELS } from "@/types/npc.types";
import { pluralizeCount } from "@/lib/utils";

export const QUEST_CONSEQUENCE_ACTION_LABELS: Record<QuestConsequenceAction, string> = {
  raise: "Raise",
  reveal: "Reveal to players",
  complete: "Complete",
  fail: "Fail",
  create_calendar_event: "Create calendar event",
  send_broadcast: "Send broadcast",
  shift_npc_relationship: "Shift an NPC's disposition",
  unlock_quest: "Unlock a quest",
  grant_knowledge: "Grant knowledge",
  owe_favor: "Owe a favor",
  award_milestone: "Award a milestone",
  give_handout: "Give a handout",
  tick_clock: "Tick clock",
  move_npc: "Move NPC",
  add_companion: "Add companion",
  shift_faction_standing: "Shift faction standing",
};

export function isLedgerConsequenceAction(action: QuestConsequenceAction): boolean {
  return QUEST_CONSEQUENCE_LEDGER_ACTIONS.includes(action);
}

/** A ledger verb that moves an *objective* (needs `target_objective_id`).
 *  `tick_clock` is engine state like them, but its target is a clock. */
export function isObjectiveConsequenceAction(action: QuestConsequenceAction): boolean {
  return isLedgerConsequenceAction(action) && action !== "tick_clock";
}

/** The four verbs added in #1011 that name a clock, NPC, place or faction. */
export const QUEST_TARGETED_WORLD_VERBS: readonly QuestConsequenceAction[] = ["tick_clock", "move_npc", "add_companion", "shift_faction_standing"];

export function isTargetedWorldVerb(action: QuestConsequenceAction): boolean {
  return QUEST_TARGETED_WORLD_VERBS.includes(action);
}

/** Shown wherever a clock picker finds the quest has none. Clocks are authored
 *  in the quest overview; the run cockpit only ticks them. */
export const NO_QUEST_CLOCKS_NOTE = "This quest has no clocks yet. Add one in the quest overview's Clocks section.";

/** "in 1 day" / "in 3 days"; empty for no delay. */
export function delayPhrase(days: number): string {
  return days > 0 ? `in ${pluralizeCount(days, "day")}` : "";
}

/** The form state behind the four #1011 verbs, shared by both authoring panels. */
export interface WorldVerbDraft {
  clockId: string;
  clockStep: number;
  npcId: string;
  locationId: string;
  factionId: string;
  shiftKey: string;
}

export function worldVerbReady(action: QuestConsequenceAction, draft: WorldVerbDraft): boolean {
  switch (action) {
    case "tick_clock": return !!draft.clockId && Number.isInteger(draft.clockStep) && draft.clockStep !== 0;
    case "move_npc": return !!draft.npcId && !!draft.locationId;
    case "add_companion": return !!draft.npcId;
    case "shift_faction_standing": return !!draft.factionId && relationshipShiftPayload(draft.shiftKey) !== null;
    default: return false;
  }
}

/** The target columns and payload a #1011 verb writes; every other target stays null. */
export function worldVerbInsertFields(action: QuestConsequenceAction, draft: WorldVerbDraft): {
  target_clock_id: string | null;
  target_npc_id: string | null;
  target_location_id: string | null;
  target_faction_id: string | null;
  action_payload: QuestConsequenceActionPayload;
} {
  return {
    target_clock_id: action === "tick_clock" ? draft.clockId : null,
    target_npc_id: action === "move_npc" || action === "add_companion" ? draft.npcId : null,
    target_location_id: action === "move_npc" ? draft.locationId : null,
    target_faction_id: action === "shift_faction_standing" ? draft.factionId : null,
    action_payload: action === "tick_clock"
      ? { step: draft.clockStep }
      : action === "shift_faction_standing"
        ? relationshipShiftPayload(draft.shiftKey)!
        : {},
  };
}

/** What `describeQuestConsequenceAction` needs to name an unlock's target
 *  quest and, when the bridge names one, the beat it enters at. Both callers
 *  that pass this (`QuestPayoffPanel`, `QuestRulesPanel`) already hold the
 *  data these read from — the campaign quest list (`useQuests()`, filtered to `undiscovered`) and the target quest's
 *  own `useQuestBeats` — so the resolver is a thin adapter, not a fetch. */
export interface QuestConsequenceLabelResolver {
  questLabel?: (id: string | null) => string;
  beatLabel?: (id: string | null) => string;
  /** `give_handout` only: the Scriptorium document's title. */
  documentLabel?: (id: string | null) => string | null;
  /** `tick_clock`: the clock's label. */
  clockLabel?: (id: string | null) => string | null;
  /** `move_npc` / `add_companion`: the NPC's name. */
  npcLabel?: (id: string | null) => string | null;
  /** `move_npc`: the destination's name. */
  locationLabel?: (id: string | null) => string | null;
  /** `shift_faction_standing`: the faction's name. */
  factionLabel?: (id: string | null) => string | null;
}

/** `Tick clock` payload as a signed count: "ticks 1", "winds back 2". */
function clockStepPhrase(step: number): string {
  return `${step > 0 ? "ticks" : "winds back"} ${Math.abs(step)}`;
}

/** Shared by NPC and faction shifts: "becomes friendly" / "improves by 2". */
function standingChangePhrase(payload: Partial<RelationshipShiftConsequencePayload>): string | null {
  if ("to" in payload && typeof payload.to === "string") return `becomes ${NPC_RELATIONSHIP_LABELS[payload.to].toLowerCase()}`;
  const step = "step" in payload ? payload.step : undefined;
  if (typeof step !== "number" || step === 0) return null;
  return `${step > 0 ? "improves" : "worsens"} by ${Math.abs(step)}`;
}

/**
 * One line describing what a consequence rule does — `Complete "Kill the
 * dragon"`, or `Calendar event: "The bridge collapses"`. Shared by the rule
 * editors (`QuestPayoffPanel` on a beat, `QuestRulesPanel` on the quest) and the backfill preview
 * (`QuestBackfillPanel`, #796), which both need to turn a `quest_consequences`
 * row into the same sentence a DM reads at a glance — extracted rather than
 * grown a second time, since the two already differ only in how they resolve
 * `objectiveLabel`.
 *
 * `resolver` is optional and `unlock_quest`-only (#871): without it — every
 * caller that predates the entry-beat bridge, plus the backfill preview and
 * the Advance dialog, neither of which has a quest/beat title handy for an
 * arbitrary target — an unlock still reads as the bare `"Unlock a quest"`
 * label. With it, `Unlock "<quest title>"`, plus ` · enters at "<beat
 * title>"` when the rule names a beat other than the target's own entry.
 */
export function describeQuestConsequenceAction(
  row: Pick<QuestConsequence, "action" | "target_objective_id" | "action_payload">
    & Partial<Pick<QuestConsequence, "target_quest_id" | "entry_beat_id" | "target_document_id" | "target_clock_id" | "target_npc_id" | "target_location_id" | "target_faction_id">>,
  objectiveLabel: (id: string | null) => string,
  resolver?: QuestConsequenceLabelResolver,
): string {
  if (row.action === "tick_clock") {
    const payload = row.action_payload as Partial<ClockTickConsequencePayload>;
    const clock = resolver?.clockLabel?.(row.target_clock_id ?? null);
    if (clock && typeof payload.step === "number" && payload.step !== 0) return `${clock} ${clockStepPhrase(payload.step)}`;
    return describeWorldConsequenceAction(row.action, row.action_payload);
  }
  if (row.action === "move_npc") {
    const npc = resolver?.npcLabel?.(row.target_npc_id ?? null);
    const place = resolver?.locationLabel?.(row.target_location_id ?? null);
    if (npc && place) return `${npc} moves to ${place}`;
  }
  if (row.action === "add_companion") {
    const npc = resolver?.npcLabel?.(row.target_npc_id ?? null);
    if (npc) return `${npc} joins the party`;
  }
  if (row.action === "shift_faction_standing") {
    const faction = resolver?.factionLabel?.(row.target_faction_id ?? null);
    const change = standingChangePhrase(row.action_payload as Partial<RelationshipShiftConsequencePayload>);
    if (faction && change) return `${faction}: standing ${change}`;
  }
  if (isObjectiveConsequenceAction(row.action)) {
    return `${QUEST_CONSEQUENCE_ACTION_LABELS[row.action]} "${objectiveLabel(row.target_objective_id)}"`;
  }
  if (row.action === "unlock_quest" && resolver?.questLabel) {
    // A resolver that comes back empty (still loading, or a target the caller
    // has no title for) drops that part rather than asserting a "Missing"
    // anything — the bare verb is true; a wrong name is not.
    const questTitle = resolver.questLabel(row.target_quest_id ?? null);
    if (!questTitle) return describeWorldConsequenceAction(row.action, row.action_payload);
    const entryBeatId = row.entry_beat_id ?? null;
    const beatTitle = entryBeatId && resolver.beatLabel ? resolver.beatLabel(entryBeatId) : "";
    const suffix = beatTitle ? ` · enters at "${beatTitle}"` : "";
    return `Unlock "${questTitle}"${suffix}`;
  }
  if (row.action === "give_handout" && resolver?.documentLabel) {
    const title = resolver.documentLabel(row.target_document_id ?? null);
    if (title) return `${QUEST_CONSEQUENCE_ACTION_LABELS.give_handout}: "${title}"`;
  }
  return describeWorldConsequenceAction(row.action, row.action_payload);
}

/** Shown where a payload promised a field and the stored row has none. */
const UNKNOWN_PAYLOAD_FIELD = "???";

/**
 * The half of the sentence that does not need an objective's name — every
 * non-ledger action, plus the ledger verbs as a bare label for callers that
 * have no objective to resolve.
 *
 * A `switch` closed by a `never` assignment rather than an if/else chain,
 * because the chain's fall-through was a real defect: everything that was not
 * `create_calendar_event` rendered as `Broadcast: "…"`, so the two actions
 * added after it — `shift_npc_relationship` (#831) and `unlock_quest` (#836) —
 * both appeared in the rule list as an *empty broadcast*, indistinguishable
 * from a broken one. Two of eight actions described wrongly, with nothing
 * failing. `gates.ts` already used a compiler-enforced map for the same union;
 * this is the same guarantee, so a ninth action cannot repeat it.
 *
 * The casts stay `Partial` on purpose: `action_payload` is jsonb, so a stored
 * row can be missing the field its type promises, and an absent title should
 * read as absent rather than as an empty string.
 */
export function describeWorldConsequenceAction(
  action: QuestConsequenceAction,
  actionPayload: QuestConsequence["action_payload"],
): string {
  switch (action) {
    case "create_calendar_event": {
      const payload = actionPayload as Partial<CalendarEventConsequencePayload>;
      return `Calendar event: "${payload.title || UNKNOWN_PAYLOAD_FIELD}"`;
    }
    case "send_broadcast": {
      const payload = actionPayload as Partial<BroadcastConsequencePayload>;
      return `Broadcast: "${payload.message || UNKNOWN_PAYLOAD_FIELD}"`;
    }
    case "shift_npc_relationship": {
      const payload = actionPayload as Partial<RelationshipShiftConsequencePayload>;
      // Signed, and the sign is the whole point — "shifts a disposition" alone
      // does not tell a DM which way the rule moves it.
      if ("to" in payload && typeof payload.to === "string") {
        return `An NPC becomes ${NPC_RELATIONSHIP_LABELS[payload.to].toLowerCase()}`;
      }
      const step = "step" in payload ? payload.step : undefined;
      if (typeof step !== "number" || step === 0) {
        return `${QUEST_CONSEQUENCE_ACTION_LABELS[action]} (${UNKNOWN_PAYLOAD_FIELD})`;
      }
      const steps = Math.abs(step) === 1 ? "step" : "steps";
      return `${step > 0 ? "Improve" : "Worsen"} an NPC's disposition by ${Math.abs(step)} ${steps}`;
    }
    case "tick_clock": {
      const payload = actionPayload as Partial<ClockTickConsequencePayload>;
      if (typeof payload.step !== "number" || payload.step === 0) return `${QUEST_CONSEQUENCE_ACTION_LABELS[action]} (${UNKNOWN_PAYLOAD_FIELD})`;
      return `A clock ${clockStepPhrase(payload.step)}`;
    }
    case "move_npc":
      return "An NPC moves to a place";
    case "add_companion":
      return "An NPC joins the party";
    case "shift_faction_standing": {
      const change = standingChangePhrase(actionPayload as Partial<RelationshipShiftConsequencePayload>);
      return change ? `A faction's standing ${change}` : `${QUEST_CONSEQUENCE_ACTION_LABELS[action]} (${UNKNOWN_PAYLOAD_FIELD})`;
    }
    case "grant_knowledge": {
      const payload = actionPayload as Partial<KnowledgeConsequencePayload>;
      return `Knowledge: "${payload.text || UNKNOWN_PAYLOAD_FIELD}"`;
    }
    case "owe_favor": {
      const payload = actionPayload as Partial<FavorConsequencePayload>;
      return `Favour owed: "${payload.text || UNKNOWN_PAYLOAD_FIELD}"`;
    }
    case "award_milestone": {
      const payload = actionPayload as Partial<MilestoneConsequencePayload>;
      return `Milestone: "${payload.text || UNKNOWN_PAYLOAD_FIELD}"`;
    }
    case "unlock_quest":
    case "give_handout":
    case "raise":
    case "reveal":
    case "complete":
    case "fail":
      return QUEST_CONSEQUENCE_ACTION_LABELS[action];
    default: {
      // A new action must be described here; this line stops compiling first.
      const unhandled: never = action;
      return unhandled;
    }
  }
}

/**
 * The one option list both authoring panels (`QuestPayoffPanel`,
 * `QuestRulesPanel`) offer for a stance shift: the five absolute stances
 * first — "becomes helpful" is what a DM reaches for at the table — then the
 * relative rungs, which compose when two beats both move the same NPC.
 * A select rather than a number field: the scale is five rungs, so "four
 * friendlier" is the whole range and a free number invites a 7 the database
 * would silently clamp. Keys are strings so one `<select>` can carry both
 * shapes; `relationshipShiftPayload` turns the chosen key back into a payload.
 */
export const RELATIONSHIP_SHIFT_OPTIONS: readonly { key: string; label: string }[] = [
  ...[...NPC_RELATIONSHIP_LADDER].reverse().map((stance) => ({ key: `to:${stance}`, label: `Becomes ${NPC_RELATIONSHIP_LABELS[stance].toLowerCase()}` })),
  ...Array.from({ length: NPC_RELATIONSHIP_LADDER.length - 1 }, (_, i) => NPC_RELATIONSHIP_LADDER.length - 1 - i),
  ...Array.from({ length: NPC_RELATIONSHIP_LADDER.length - 1 }, (_, i) => -(i + 1)),
].map((entry) => typeof entry === "number"
  ? { key: `step:${entry}`, label: `${Math.abs(entry)} ${Math.abs(entry) === 1 ? "rung" : "rungs"} ${entry > 0 ? "friendlier" : "colder"}` }
  : entry);

export const DEFAULT_RELATIONSHIP_SHIFT_KEY = "to:friendly";

export function relationshipShiftPayload(key: string): RelationshipShiftConsequencePayload | null {
  const [kind, value] = key.split(":");
  if (kind === "to" && (NPC_RELATIONSHIP_LADDER as readonly string[]).includes(value ?? "")) return { to: value as NpcStance };
  if (kind === "step") {
    const step = Number(value);
    if (Number.isInteger(step) && step !== 0) return { step };
  }
  return null;
}

/** Whether a shift reads as a gain (green) or a cost: an absolute stance is a
 *  gain when it lands on the friendly half of the ladder, a step when it is
 *  positive. */
export function relationshipShiftIsGain(payload: Partial<RelationshipShiftConsequencePayload>): boolean {
  if ("to" in payload && typeof payload.to === "string") return payload.to === "friendly" || payload.to === "helpful";
  return "step" in payload && typeof payload.step === "number" && payload.step > 0;
}
