import type {
  QuestBeatAttachment,
  QuestBeatAttachmentSummary,
  QuestBeatAttachmentType,
} from "@/types/quest.types";

export interface QuestBeatAttachmentAdapter {
  type: QuestBeatAttachmentType;
  label: string;
  runAction: "run" | "view" | "play" | "manage";
  containedSurface: "encounter" | "atlas" | "entity" | "audio" | "document" | "objective";
  summary: (attachment: QuestBeatAttachment, target: { label: string; detail?: string | null } | null) => { label: string; detail: string | null };
  fullEditorTo: (refId: string, questId: string) => string | null;
}

const summary = (attachment: QuestBeatAttachment, target: { label: string; detail?: string | null } | null) => ({
  label: target?.label ?? `Missing ${QUEST_BEAT_ATTACHMENT_ADAPTERS[attachment.attachment_type].label.toLowerCase()}`,
  detail: target?.detail ?? (attachment.role || null),
});

export const QUEST_BEAT_ATTACHMENT_ADAPTERS: Record<QuestBeatAttachmentType, QuestBeatAttachmentAdapter> = {
  encounter: { type: "encounter", label: "Encounter", runAction: "run", containedSurface: "encounter", summary, fullEditorTo: (id) => `/encounters/${id}` },
  objective: { type: "objective", label: "Objective", runAction: "manage", containedSurface: "objective", summary, fullEditorTo: (_id, questId) => `/quests/${questId}?overview=true` },
  quest_ref: { type: "quest_ref", label: "Quest reference", runAction: "view", containedSurface: "entity", summary, fullEditorTo: (_id, questId) => `/quests/${questId}?overview=true` },
  location_set: { type: "location_set", label: "Atlas set", runAction: "view", containedSurface: "atlas", summary, fullEditorTo: (id) => `/locations/${id}` },
  npc: { type: "npc", label: "NPC", runAction: "view", containedSurface: "entity", summary, fullEditorTo: (id) => `/npcs/${id}` },
  faction: { type: "faction", label: "Faction", runAction: "view", containedSurface: "entity", summary, fullEditorTo: (id) => `/factions/${id}` },
  item: { type: "item", label: "Item", runAction: "view", containedSurface: "entity", summary, fullEditorTo: (id) => `/vault/${id}` },
  monster: { type: "monster", label: "Monster", runAction: "view", containedSurface: "entity", summary, fullEditorTo: (id) => `/monsters/${id}` },
  sound: { type: "sound", label: "Sound", runAction: "play", containedSurface: "audio", summary, fullEditorTo: () => "/soundboard" },
  audio_scene: { type: "audio_scene", label: "Audio scene", runAction: "play", containedSurface: "audio", summary, fullEditorTo: () => "/soundboard" },
  playlist: { type: "playlist", label: "Playlist", runAction: "play", containedSurface: "audio", summary, fullEditorTo: () => "/soundboard" },
  note: { type: "note", label: "Note", runAction: "view", containedSurface: "document", summary, fullEditorTo: (id) => `/notes/${id}` },
  handout: { type: "handout", label: "Handout", runAction: "view", containedSurface: "document", summary, fullEditorTo: (id) => `/scriptorium/${id}` },
};

export function summarizeQuestBeatAttachment(
  attachment: QuestBeatAttachment,
  target: { label: string; detail?: string | null } | null,
): QuestBeatAttachmentSummary {
  const adapter = QUEST_BEAT_ATTACHMENT_ADAPTERS[attachment.attachment_type];
  const targetExists = target !== null;
  const compact = adapter.summary(attachment, target);
  return {
    ...attachment,
    label: compact.label,
    target_exists: targetExists,
    prep_gap: attachment.is_required && !targetExists,
    compact_detail: compact.detail,
    full_editor_to: targetExists ? adapter.fullEditorTo(attachment.ref_id, attachment.quest_id) : null,
  };
}
