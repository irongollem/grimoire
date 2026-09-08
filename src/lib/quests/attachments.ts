import type {
  QuestBeatAttachment,
  QuestBeatAttachmentSummary,
  QuestBeatAttachmentType,
  QuestCheckAttachmentMetadata,
} from "@/types/quest.types";

export interface QuestBeatAttachmentAdapter {
  type: QuestBeatAttachmentType;
  label: string;
  runAction: "run" | "view" | "play" | "roll";
  containedSurface: "encounter" | "entity" | "audio" | "document" | "check";
  summary: (attachment: QuestBeatAttachment, target: { label: string; detail?: string | null } | null) => { label: string; detail: string | null };
  fullEditorTo: (refId: string, questId: string) => string | null;
}

const summary = (attachment: QuestBeatAttachment, target: { label: string; detail?: string | null } | null) => ({
  label: target?.label ?? `Missing ${QUEST_BEAT_ATTACHMENT_ADAPTERS[attachment.attachment_type].label.toLowerCase()}`,
  detail: target?.detail ?? (attachment.role || null),
});

/**
 * A check carries its own data in `metadata` — there is no row to join, so
 * unlike every other adapter's `summary` this one ignores `target` entirely
 * and reads the attachment directly.
 */
const checkSummary = (attachment: QuestBeatAttachment, _target: { label: string; detail?: string | null } | null) => {
  const metadata = attachment.metadata as unknown as QuestCheckAttachmentMetadata;
  return {
    label: `${metadata.skill} DC ${metadata.dc}`,
    detail: metadata.contested_by ? `Contested by ${metadata.contested_by}` : (metadata.note ?? null),
  };
};

export const QUEST_BEAT_ATTACHMENT_ADAPTERS: Record<QuestBeatAttachmentType, QuestBeatAttachmentAdapter> = {
  encounter: { type: "encounter", label: "Encounter", runAction: "run", containedSurface: "encounter", summary, fullEditorTo: (id) => `/encounters/${id}` },
  npc: { type: "npc", label: "NPC", runAction: "view", containedSurface: "entity", summary, fullEditorTo: (id) => `/npcs/${id}` },
  faction: { type: "faction", label: "Faction", runAction: "view", containedSurface: "entity", summary, fullEditorTo: (id) => `/factions/${id}` },
  item: { type: "item", label: "Item", runAction: "view", containedSurface: "entity", summary, fullEditorTo: (id) => `/vault/${id}` },
  monster: { type: "monster", label: "Monster", runAction: "view", containedSurface: "entity", summary, fullEditorTo: (id) => `/monsters/${id}` },
  check: { type: "check", label: "Check", runAction: "roll", containedSurface: "check", summary: checkSummary, fullEditorTo: () => null },
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
  // A check carries its own data instead of pointing at a row, so it is never
  // missing — `target` (always null for it, since nothing is fetched for a
  // non-uuid ref_id) must not be read as "not found" the way every other type
  // reads it.
  const targetExists = attachment.attachment_type === "check" ? true : target !== null;
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
