<template>
  <article class="space-y-4 rounded-xl border border-border bg-background p-4" aria-label="Current quest beat">
    <header class="flex flex-wrap items-start gap-2">
      <div class="min-w-0 flex-1">
        <p class="text-label font-bold uppercase tracking-wider text-primary">Current beat · {{ beat.kind }}</p>
        <h2 class="font-cinzel text-xl font-bold text-foreground">{{ beat.title || "Untitled beat" }}</h2>
      </div>
      <AppButton :to="editUrl" label="Prep this beat" size="sm" variant="subtle" />
    </header>

    <section v-if="beat.read_aloud" class="rounded-lg border border-primary/30 bg-primary/5 p-4">
      <h3 class="mb-2 font-cinzel text-sm font-bold text-primary">Read aloud</h3>
      <RichTextViewer :content="beat.read_aloud" />
    </section>

    <div class="grid gap-3 lg:grid-cols-2">
      <section v-if="beat.dm_content || beat.how_it_plays" class="space-y-3 rounded-lg border border-border bg-card p-3">
        <h3 class="font-cinzel text-sm font-bold text-foreground">Run this moment</h3>
        <RichTextViewer v-if="beat.dm_content" :content="beat.dm_content" />
        <div v-if="beat.how_it_plays">
          <p class="mb-1 text-caption font-semibold text-muted-foreground">How it plays</p>
          <RichTextViewer :content="beat.how_it_plays" />
        </div>
      </section>
      <section v-if="beat.outcomes || beat.consequences" class="space-y-3 rounded-lg border border-border bg-card p-3">
        <h3 class="font-cinzel text-sm font-bold text-foreground">Outcomes & consequences</h3>
        <RichTextViewer v-if="beat.outcomes" :content="beat.outcomes" />
        <RichTextViewer v-if="beat.consequences" :content="beat.consequences" />
      </section>
    </div>

    <section v-if="attachments.length" class="space-y-2">
      <h3 class="font-cinzel text-sm font-bold text-foreground">Prepared material</h3>
      <div class="grid gap-2 sm:grid-cols-2">
        <div v-for="attachment in attachments" :key="attachment.id" class="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
          <span class="rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">{{ attachment.attachment_type.replace('_', ' ') }}</span>
          <span class="min-w-0 flex-1 truncate text-caption" :class="attachment.prep_gap ? 'text-tone-caution' : 'text-foreground'">{{ attachment.label }}</span>
          <AppButton v-if="attachment.full_editor_to" :to="specialistUrl(attachment.full_editor_to)" label="Open" size="xs" variant="subtle" />
        </div>
      </div>
    </section>

    <div v-if="readinessGaps.length" class="rounded-lg border border-tone-caution/50 bg-tone-caution/5 p-3 text-caption text-tone-caution">
      <p class="font-semibold">Run anyway—{{ readinessGaps.length }} prep gap{{ readinessGaps.length === 1 ? '' : 's' }}</p>
      <ul class="mt-1 list-disc pl-4"><li v-for="gap in readinessGaps" :key="gap">{{ gap }}</li></ul>
    </div>

    <QuestBeatLootPanel v-if="loot.length" :beat="beat" :loot="loot" @dirty="emit('dirty', $event)" />
  </article>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { QuestBeat, QuestBeatAttachmentSummary, QuestBeatLoot } from "@/types/quest.types";
import { withQuestReturnTo } from "@/lib/quests/navigation";
import AppButton from "@/components/common/AppButton.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import QuestBeatLootPanel from "./QuestBeatLootPanel.vue";

const props = defineProps<{
  anchorQuestId: string;
  beat: QuestBeat;
  attachments: QuestBeatAttachmentSummary[];
  loot: QuestBeatLoot[];
}>();
const emit = defineEmits<{ dirty: [dirty: boolean] }>();

const runReturn = computed(() => `/quests/${props.anchorQuestId}?mode=run&beat=${props.beat.id}`);
const editUrl = computed(() => ({
  path: `/quests/${props.beat.quest_id}/beats/${props.beat.id}`,
  query: { returnTo: runReturn.value },
}));
const readinessGaps = computed(() => {
  const gaps: string[] = [];
  if (!props.beat.dm_content && !props.beat.how_it_plays) gaps.push("No DM guidance");
  for (const attachment of props.attachments.filter((row) => row.prep_gap)) gaps.push(`${attachment.label} is missing`);
  return gaps;
});

function specialistUrl(path: string) {
  return withQuestReturnTo(path, runReturn.value);
}
</script>
