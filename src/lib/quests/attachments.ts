import type {
  QuestBeatAttachment,
  QuestBeatAttachmentSummary,
  QuestBeatAttachmentType,
} from "@/types/quest.types";

export interface QuestBeatAttachmentAdapter {
  type: QuestBeatAttachmentType;
  label: string;
  fullEditorTo: (refId: string, questId: string) => string | null;
}

export const QUEST_BEAT_ATTACHMENT_ADAPTERS: Record<QuestBeatAttachmentType, QuestBeatAttachmentAdapter> = {
  encounter: { type: "encounter", label: "Encounter", fullEditorTo: (id) => `/encounters/${id}` },
  objective: { type: "objective", label: "Objective", fullEditorTo: (_id, questId) => `/quests/${questId}?edit=true` },
  quest_ref: { type: "quest_ref", label: "Quest reference", fullEditorTo: (_id, questId) => `/quests/${questId}?edit=true` },
  location_set: { type: "location_set", label: "Atlas set", fullEditorTo: (id) => `/locations/${id}` },
  npc: { type: "npc", label: "NPC", fullEditorTo: (id) => `/npcs/${id}` },
  faction: { type: "faction", label: "Faction", fullEditorTo: (id) => `/factions/${id}` },
  sound: { type: "sound", label: "Sound", fullEditorTo: () => "/soundboard" },
  playlist: { type: "playlist", label: "Audio scene", fullEditorTo: () => "/soundboard" },
  note: { type: "note", label: "Note", fullEditorTo: (id) => `/notes/${id}` },
  handout: { type: "handout", label: "Handout", fullEditorTo: (id) => `/scriptorium/${id}` },
};

export function summarizeQuestBeatAttachment(
  attachment: QuestBeatAttachment,
  target: { label: string; detail?: string | null } | null,
): QuestBeatAttachmentSummary {
  const adapter = QUEST_BEAT_ATTACHMENT_ADAPTERS[attachment.attachment_type];
  const targetExists = target !== null;
  return {
    ...attachment,
    label: target?.label ?? `Missing ${adapter.label.toLowerCase()}`,
    target_exists: targetExists,
    prep_gap: attachment.is_required && !targetExists,
    compact_detail: target?.detail ?? (attachment.role || null),
    full_editor_to: targetExists ? adapter.fullEditorTo(attachment.ref_id, attachment.quest_id) : null,
  };
}
