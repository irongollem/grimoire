<template>
  <div v-if="ordered.length" class="flex flex-wrap gap-2" aria-label="Placed at this beat">
    <AppButton
      v-for="attachment in ordered"
      :key="attachment.id"
      :label="labelOf(attachment)"
      :icon="ICONS[attachment.attachment_type]"
      size="sm"
      :variant="attachment.attachment_type === 'check' || attachment.attachment_type === 'encounter' ? 'primary' : 'subtle'"
      :disabled="!attachment.target_exists"
      :tooltip="attachment.target_exists ? undefined : 'Not prepared yet'"
      @click="emit('open', attachment)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { QuestBeatAttachmentSummary, QuestBeatAttachmentType, QuestCheckAttachmentMetadata } from "@/types/quest.types";
import { IconDice, IconDocument, IconEncounter, IconFaction, IconMonster, IconMusic, IconMusicNote, IconNote, IconPackage, IconUserRound } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";

/**
 * What is placed at the beat, as buttons: the fight (an encounter opens its
 * contained tool), the roll, the NPC. A check leads the row and reads as the
 * roll ("Roll Insight"), since it is what the table does next.
 */
const { attachments } = defineProps<{ attachments: QuestBeatAttachmentSummary[] }>();
const emit = defineEmits<{ open: [attachment: QuestBeatAttachmentSummary] }>();

const ordered = computed(() => [
  ...attachments.filter((row) => row.attachment_type === "check"),
  ...attachments.filter((row) => row.attachment_type !== "check"),
]);

function labelOf(attachment: QuestBeatAttachmentSummary): string {
  if (attachment.attachment_type !== "check") return attachment.label;
  return `Roll ${(attachment.metadata as unknown as QuestCheckAttachmentMetadata).skill}`;
}

const ICONS: Record<QuestBeatAttachmentType, typeof IconEncounter> = {
  encounter: IconEncounter,
  npc: IconUserRound,
  faction: IconFaction,
  item: IconPackage,
  monster: IconMonster,
  check: IconDice,
  sound: IconMusicNote,
  audio_scene: IconMusic,
  playlist: IconMusicNote,
  note: IconNote,
  handout: IconDocument,
};
</script>
