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

    <!-- Below `xl` this collapses into a fold row (#872, frame 1): mid-session
         the DM needs the read-aloud and the way onward, not the notes. A
         `v-if`/`v-else-if` switch on the breakpoint rather than a CSS-hidden
         duplicate — `RichTextViewer` mounts a full Tiptap editor, and running
         two live instances of the same content for one to sit invisible is
         exactly the "heavy" case CLAUDE.md's motion rules reserve JS gating for. -->
    <section v-if="(beat.dm_content || beat.how_it_plays) && !belowXl" class="space-y-3">
      <RichTextViewer v-if="beat.dm_content" :content="beat.dm_content" />
      <div v-if="beat.how_it_plays">
        <p class="mb-1 text-body font-bold text-foreground">How it plays.</p>
        <RichTextViewer :content="beat.how_it_plays" />
      </div>
    </section>
    <QuestFoldRow
      v-else-if="beat.dm_content || beat.how_it_plays"
      v-model:open="notesOpen"
      title="DM notes & how it plays"
      :caption="notesCaption"
      :icon="IconNote"
    >
      <div class="space-y-3">
        <RichTextViewer v-if="beat.dm_content" :content="beat.dm_content" />
        <div v-if="beat.how_it_plays">
          <p class="mb-1 text-body font-bold text-foreground">How it plays.</p>
          <RichTextViewer :content="beat.how_it_plays" />
        </div>
      </div>
    </QuestFoldRow>

    <div class="flex flex-wrap gap-2">
      <AppButton
        v-for="attachment in orderedAttachments"
        :key="attachment.id"
        :label="attachmentButtonLabel(attachment)"
        :icon="attachmentIcon(attachment.attachment_type)"
        size="sm"
        :variant="attachment.attachment_type === 'check' ? 'primary' : 'subtle'"
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
import { computed, ref } from "vue";
import type { QuestBeat, QuestBeatAttachmentSummary, QuestBeatAttachmentType, QuestCheckAttachmentMetadata } from "@/types/quest.types";
import { questSurfaceReturnTo } from "@/lib/quests/navigation";
import type { ThreadBadge } from "@/lib/quests/threads";
import { countQuestBeatContentBlocks, deriveQuestBeatPrepGaps } from "@/lib/quests/presentation";
import { useBelow } from "@/composables/useBreakpoint";
import AppButton from "@/components/common/AppButton.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import QuestFoldRow from "./QuestFoldRow.vue";
import {
  IconDice,
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

const runReturn = computed(() => questSurfaceReturnTo(props.anchorQuestId, props.beat.id, "run"));
const editUrl = computed(() => ({
  path: `/quests/${props.beat.quest_id}/beats/${props.beat.id}`,
  query: { returnTo: runReturn.value },
}));
const prepGaps = computed(() => deriveQuestBeatPrepGaps(props.beat, props.attachments));

// Wrapped in a `computed` rather than used directly: `useBelow` is mocked in
// tests as a plain `{ value }` box (see QuestAdvanceDialog.test.ts's own
// convention), which the template's ref-auto-unwrap does not see through —
// only a real `computed` reads `.value` reliably regardless of what the
// underlying hook returns.
const belowXlSource = useBelow("xl");
const belowXl = computed(() => belowXlSource.value);
const notesOpen = ref(false);

const notesCaption = computed(() => {
  const counts = [countQuestBeatContentBlocks(props.beat.dm_content), countQuestBeatContentBlocks(props.beat.how_it_plays)]
    .filter((count): count is number => count !== null);
  if (!counts.length) return "notes";
  const total = counts.reduce((sum, count) => sum + count, 0);
  return `${total} paragraph${total === 1 ? "" : "s"}`;
});

// A check attachment's button leads with the roll ("Roll Insight") rather than
// the beat's own label, and comes first in the row — it is the action the
// table takes right now, not a reference the DM opens.
const orderedAttachments = computed(() => {
  const checks = props.attachments.filter((attachment) => attachment.attachment_type === "check");
  const rest = props.attachments.filter((attachment) => attachment.attachment_type !== "check");
  return [...checks, ...rest];
});

function attachmentButtonLabel(attachment: QuestBeatAttachmentSummary) {
  if (attachment.attachment_type !== "check") return attachment.label;
  const metadata = attachment.metadata as unknown as QuestCheckAttachmentMetadata;
  return `Roll ${metadata.skill}`;
}

const ATTACHMENT_ICONS: Record<QuestBeatAttachmentType, typeof IconEncounter> = {
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
function attachmentIcon(type: QuestBeatAttachmentType) {
  return ATTACHMENT_ICONS[type];
}
</script>
