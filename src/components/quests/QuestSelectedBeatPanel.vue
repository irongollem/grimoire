<template>
  <section class="rounded-lg border border-border bg-card p-3" aria-label="Selected beat">
    <header class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <p class="text-caption uppercase text-muted-foreground">{{ kindEyebrow }}</p>
        <h3 class="truncate font-cinzel text-sm font-bold text-foreground">{{ beat.title || "Untitled beat" }}</h3>
      </div>
      <div class="flex shrink-0 gap-1.5">
        <AppButton :icon="IconReveal" size="icon-xs" variant="subtle" tooltip="Preview as players" @click="emit('preview')" />
        <AppButton :to="openTo" label="Open beat" size="xs" variant="subtle" />
      </div>
    </header>
    <div class="mt-2 flex flex-wrap gap-1.5 text-caption text-muted-foreground">
      <span v-if="presentation?.prepGapCount" class="rounded bg-tone-caution/15 px-1.5 py-0.5 text-ink-caution">{{ presentation.prepGapCount }} prep gap{{ presentation.prepGapCount === 1 ? '' : 's' }}</span>
      <span v-if="presentation?.payoffCount" class="rounded bg-muted px-1.5 py-0.5">{{ presentation.payoffCount }} payoff{{ presentation.payoffCount === 1 ? '' : 's' }}</span>
      <span v-if="presentation?.loot.undispatched" class="rounded bg-muted px-1.5 py-0.5">{{ presentation.loot.undispatched }} loot held</span>
      <span v-if="presentation?.convergeLabel" class="rounded bg-muted px-1.5 py-0.5">converge · {{ presentation.convergeLabel }}</span>
      <span v-if="presentation?.site" class="rounded bg-tone-info/15 px-1.5 py-0.5 text-ink-info">site · {{ presentation.site.roomCount }} room{{ presentation.site.roomCount === 1 ? '' : 's' }}</span>
      <span v-if="presentation?.site?.emptyRoomLabel" class="rounded bg-tone-caution/15 px-1.5 py-0.5 text-ink-caution">{{ presentation.site.emptyRoomLabel }}</span>
      <span v-if="presentation?.unlocksQuest" class="rounded bg-muted px-1.5 py-0.5">unlocks a quest</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { IconReveal } from "@/lib/icons";
import type { QuestBeatPresentation } from "@/lib/quests/presentation";
import { QUEST_BEAT_KIND_LABELS, type QuestBeat } from "@/types/quest.types";

const { beat, presentation } = defineProps<{ beat: QuestBeat; presentation?: QuestBeatPresentation }>();
const emit = defineEmits<{ preview: [] }>();

const kindEyebrow = computed(() => `${QUEST_BEAT_KIND_LABELS[beat.kind as keyof typeof QUEST_BEAT_KIND_LABELS] ?? beat.kind} · ${beat.visibility}`);
const openTo = computed(() => ({
  path: `/quests/${beat.quest_id}/beats/${beat.id}`,
  query: { returnTo: `/quests/${beat.quest_id}?beat=${beat.id}` },
}));
</script>
