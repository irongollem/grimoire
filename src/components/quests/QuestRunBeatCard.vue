<template>
  <article class="space-y-4 rounded-xl border border-border bg-background p-4" aria-label="Current quest beat">
    <div class="flex flex-wrap items-center gap-1.5">
      <span
        class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-label uppercase"
        :class="[threadBadge.tone.bg, threadBadge.tone.text]"
      >
        <span class="h-1.5 w-1.5 animate-pulse rounded-full" :class="threadBadge.tone.dot" />
        Party is here · Thread {{ threadBadge.letter }}
      </span>
      <span class="rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">{{ beat.kind }}</span>
      <span class="rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">{{ beat.visibility }}</span>
      <span v-if="placeName" class="rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">{{ placeName }}</span>
      <span v-for="gap in prepGaps" :key="gap.label" class="rounded bg-tone-caution/15 px-1.5 py-0.5 text-label uppercase text-ink-caution">{{ gap.label }}</span>
    </div>

    <h2 class="font-cinzel text-xl font-bold text-foreground">{{ beat.title || "Untitled beat" }}</h2>

    <div v-if="beat.is_improvised && !beat.improv_reviewed_at" class="rounded-lg border border-tone-caution/50 bg-tone-caution/5 p-3 text-caption text-tone-caution">
      Improvised at the table · needs post-session review. You can still run, attach material, take notes, and reveal it now.
    </div>

    <section v-if="beat.read_aloud" class="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <h3 class="mb-2 font-cinzel text-sm font-bold text-primary">Read aloud</h3>
      <RichTextViewer :content="beat.read_aloud" />
    </section>

    <section v-if="beat.dm_content || beat.how_it_plays" class="space-y-3">
      <RichTextViewer v-if="beat.dm_content" :content="beat.dm_content" />
      <div v-if="beat.how_it_plays">
        <p class="mb-1 text-body font-bold text-foreground">How it plays.</p>
        <RichTextViewer :content="beat.how_it_plays" />
      </div>
    </section>

    <div class="flex flex-wrap gap-2">
      <AppButton
        v-for="attachment in attachments"
        :key="attachment.id"
        :label="attachment.label"
        :icon="attachmentIcon(attachment.attachment_type)"
        size="sm"
        variant="subtle"
        :disabled="!attachment.target_exists"
        :tooltip="attachment.target_exists ? undefined : 'Not prepared yet'"
        @click="emit('open-attachment', attachment)"
      />
      <AppButton label="Edit beat" :icon="IconEdit" :to="editUrl" size="sm" variant="subtle" />
      <AppButton
        v-if="beat.visibility !== 'revealed'"
        :label="beat.visibility === 'rumored' ? 'Reveal fully' : 'Reveal to players'"
        size="sm"
        variant="primary"
        @click="emit('reveal')"
      />
      <span v-else class="self-center text-caption text-elven-green">Visible to players</span>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { QuestBeat, QuestBeatAttachmentSummary, QuestBeatAttachmentType } from "@/types/quest.types";
import type { ThreadBadge } from "@/lib/quests/threads";
import { deriveQuestBeatPrepGaps } from "@/lib/quests/presentation";
import AppButton from "@/components/common/AppButton.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import {
  IconDocument,
  IconEdit,
  IconEncounter,
  IconFaction,
  IconMonster,
  IconMusic,
  IconMusicNote,
  IconNote,
  IconPackage,
  IconUserRound,
} from "@/lib/icons";

const props = defineProps<{
  anchorQuestId: string;
  beat: QuestBeat;
  attachments: QuestBeatAttachmentSummary[];
  threadBadge: ThreadBadge;
  placeName: string | null;
}>();
const emit = defineEmits<{ "open-attachment": [attachment: QuestBeatAttachmentSummary]; reveal: [] }>();

const runReturn = computed(() => `/quests/${props.anchorQuestId}?beat=${props.beat.id}`);
const editUrl = computed(() => ({
  path: `/quests/${props.beat.quest_id}/beats/${props.beat.id}`,
  query: { returnTo: runReturn.value },
}));
const prepGaps = computed(() => deriveQuestBeatPrepGaps(props.beat, props.attachments));

const ATTACHMENT_ICONS: Record<QuestBeatAttachmentType, typeof IconEncounter> = {
  encounter: IconEncounter,
  npc: IconUserRound,
  faction: IconFaction,
  item: IconPackage,
  monster: IconMonster,
  sound: IconMusicNote,
  audio_scene: IconMusic,
  playlist: IconMusicNote,
  note: IconNote,
  handout: IconDocument,
};
function attachmentIcon(type: QuestBeatAttachmentType) {
  return ATTACHMENT_ICONS[type];
}
</script>
