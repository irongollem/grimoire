export type QuestStatus = "active" | "on_hold" | "completed" | "failed";

export const QUEST_STATUSES: QuestStatus[] = ["active", "on_hold", "completed", "failed"];

export const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  active:    "Active",
  on_hold:   "On Hold",
  completed: "Completed",
  failed:    "Failed",
};

export const QUEST_STATUS_COLORS: Record<QuestStatus, string> = {
  active:    "#16a34a",
  on_hold:   "#ca8a04",
  completed: "#0284c7",
  failed:    "#dc2626",
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
  is_player_visible: boolean;
  reward_currency_pools: RewardCurrencyPool[];
  started_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type QuestInsert = Omit<Quest, "id" | "user_id" | "created_at" | "updated_at">;
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
export type QuestObjectiveUpdate = Partial<Omit<QuestObjective, "id" | "quest_id">>;

export interface RewardCurrencyPool {
  id: string;
  label: string;
  pp: number;
  gp: number;
  ep: number;
  sp: number;
  cp: number;
}

export type QuestRefType = "npc" | "location" | "monster" | "item" | "encounter";

export const QUEST_REF_TYPE_LABELS: Record<QuestRefType, string> = {
  npc:      "NPC",
  location: "Location",
  monster:  "Monster",
  item:     "Item",
  encounter: "Encounter",
};

export interface QuestRef {
  id: string;
  quest_id: string;
  ref_type: QuestRefType;
  ref_id: string;
  is_player_visible: boolean;
}

export type QuestRefInsert = Omit<QuestRef, "id" | "is_player_visible"> & { is_player_visible?: boolean };

export interface QuestPlayerNote {
  id: string;
  user_id: string;
  quest_id: string;
  campaign_id: string;
  content: string;
  is_private: boolean;
  created_at: string;
  updated_at: string;
}

export type QuestPlayerNoteUpsert = Pick<QuestPlayerNote, "quest_id" | "campaign_id" | "content" | "is_private">;
