export type QuestStatus =
  | "undiscovered"
  | "active"
  | "on_hold"
  | "completed"
  | "failed";

export const QUEST_STATUSES: QuestStatus[] = [
  "undiscovered",
  "active",
  "on_hold",
  "completed",
  "failed",
];

export const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  undiscovered: "Undiscovered",
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  failed: "Failed",
};

export const QUEST_STATUS_COLORS: Record<QuestStatus, string> = {
  undiscovered: "#9ca3af",
  active: "#16a34a",
  on_hold: "#ca8a04",
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

export interface RewardCurrencyPool {
  id: string;
  label: string;
  pp: number;
  gp: number;
  ep: number;
  sp: number;
  cp: number;
}

export type QuestRefType = "npc" | "location" | "monster" | "encounter";

export const QUEST_REF_TYPE_LABELS: Record<QuestRefType, string> = {
  npc: "NPC",
  location: "Location",
  monster: "Monster",
  encounter: "Encounter",
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
