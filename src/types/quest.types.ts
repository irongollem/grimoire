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
  summary: string | null;
  status: QuestStatus;
  giver_npc_id: string | null;
  location_id: string | null;
  rewards: string | null;
  reward_pp: number;
  reward_gp: number;
  reward_ep: number;
  reward_sp: number;
  reward_cp: number;
  tags: string[];
  description: string | null; // Tiptap JSON — full narrative
  notes: string | null; // Tiptap JSON — DM session notes
  player_visible_to: string[];
  reward_item_ids: string[];
  reward_currency_pools: RewardCurrencyPool[];
  reward_art_objects?: import("@/types/encounter.types").ArtObject[];
  started_at: string | null;
  resolved_at: string | null;
  ai_provenance?: AiProvenance | null;
  created_at: string;
  updated_at: string;
}

export type QuestInsert = Omit<
  Quest,
  "id" | "user_id" | "created_at" | "updated_at"
>;
export type QuestUpdate = Partial<QuestInsert>;

export interface QuestObjective {
  id: string;
  quest_id: string;
  description: string;
  is_done: boolean;
  is_player_visible: boolean;
  sort_order: number;
}

export type QuestObjectiveInsert = Omit<QuestObjective, "id">;
export type QuestObjectiveUpdate = Partial<
  Omit<QuestObjective, "id" | "quest_id">
>;

export type QuestBeatVisibility = "hidden" | "rumored" | "revealed";
export type QuestBeatKind = "combat" | "social" | "explore" | "discovery" | "neutral" | (string & {});

export interface QuestBeat {
  id: string;
  quest_id: string;
  campaign_id: string;
  title: string;
  dm_content: string | null;
  rumor_text: string | null;
  reveal_text: string | null;
  visibility: QuestBeatVisibility;
  kind: QuestBeatKind;
  presentation_hint: string | null;
  canvas_x: number;
  canvas_y: number;
  is_improvised: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type QuestBeatInsert = Omit<QuestBeat, "id" | "created_by" | "created_at" | "updated_at"> & {
  id?: string;
};
export type QuestBeatUpdate = Partial<Omit<QuestBeatInsert, "quest_id" | "campaign_id">>;

export interface QuestBeatEdge {
  id: string;
  quest_id: string;
  campaign_id: string;
  source_beat_id: string;
  target_beat_id: string;
  label: string;
  created_by: string | null;
  created_at: string;
}

export type QuestBeatEdgeInsert = Omit<QuestBeatEdge, "id" | "created_by" | "created_at">;

export interface QuestRuntimeState {
  campaign_id: string;
  current_quest_id: string | null;
  current_beat_id: string | null;
  return_stack: Array<{ quest_id: string; beat_id: string }>;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type QuestTransitionKind = "enter" | "forward" | "previous" | "jump" | "return" | "improv";

export interface QuestBeatTransition {
  id: string;
  campaign_id: string;
  from_quest_id: string | null;
  from_beat_id: string | null;
  to_quest_id: string;
  to_beat_id: string;
  transition_kind: QuestTransitionKind;
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
  updated_at: string;
}

export type QuestBeatAttachmentType =
  | "encounter"
  | "objective"
  | "quest_ref"
  | "location_set"
  | "npc"
  | "faction"
  | "sound"
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

export type TriggerType = "quest_complete" | "objective_done";
export type TriggerActionType = "create_calendar_event" | "send_broadcast";

export interface CalendarEventTriggerPayload {
  title: string;
  event_type: string;
  description?: string;
}

export interface BroadcastTriggerPayload {
  message: string;
}

export interface QuestTrigger {
  id: string;
  user_id: string;
  quest_id: string;
  objective_id: string | null;
  trigger_type: TriggerType;
  offset_days: number;
  action_type: TriggerActionType;
  action_payload: CalendarEventTriggerPayload | BroadcastTriggerPayload;
  created_at: string;
  updated_at: string;
}

export type QuestTriggerInsert = Omit<QuestTrigger, "id" | "user_id" | "created_at" | "updated_at">;
export type QuestTriggerUpdate = Partial<Omit<QuestTriggerInsert, "quest_id">>;

export interface QuestTriggerScheduled {
  id: string;
  user_id: string;
  campaign_id: string;
  trigger_id: string;
  quest_id: string;
  fire_year: number;
  fire_month: number;
  fire_day: number;
  fired_at: string | null;
  created_at: string;
  updated_at: string;
}
