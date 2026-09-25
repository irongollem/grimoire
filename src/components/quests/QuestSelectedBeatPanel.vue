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
    <!-- Where the beat happens, linked, so the DM can go to the site or room
         from the flow without opening the beat first. -->
    <p v-if="staging" class="mt-2 flex min-w-0 flex-wrap items-center gap-1 text-caption">
      <IconDungeon class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <template v-if="staging.siteId && staging.siteName">
        <AppButton variant="link" size="inline-caption" :label="staging.siteName" :to="placeRoute(staging.siteId)" />
        <span class="text-muted-foreground" aria-hidden="true">›</span>
      </template>
      <AppButton variant="link" size="inline-caption" :label="staging.name" :to="placeRoute(staging.locationId)" />
    </p>
    <div class="mt-2 flex flex-wrap gap-1.5 text-caption text-muted-foreground">
      <span v-if="presentation?.prepGapCount" class="rounded bg-tone-caution/15 px-1.5 py-0.5 text-ink-caution">{{ presentation.prepGapCount }} prep gap{{ presentation.prepGapCount === 1 ? '' : 's' }}</span>
      <span v-if="presentation?.payoffCount" class="rounded bg-muted px-1.5 py-0.5">{{ presentation.payoffCount }} payoff{{ presentation.payoffCount === 1 ? '' : 's' }}</span>
      <span v-if="presentation?.loot.undispatched" class="rounded bg-muted px-1.5 py-0.5">{{ presentation.loot.undispatched }} loot held</span>
      <span v-if="presentation?.convergeLabel" class="rounded bg-muted px-1.5 py-0.5">converge · {{ presentation.convergeLabel }}</span>
      <span v-if="presentation?.site" class="rounded bg-tone-info/15 px-1.5 py-0.5 text-ink-info">site · {{ presentation.site.spaceCountLabel }}</span>
      <span v-if="presentation?.site?.emptyRoomLabel" class="rounded bg-tone-caution/15 px-1.5 py-0.5 text-ink-caution">{{ presentation.site.emptyRoomLabel }}</span>
      <span v-if="presentation?.unlocksQuest" class="rounded bg-muted px-1.5 py-0.5">unlocks a quest</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import { IconDungeon, IconReveal } from "@/lib/icons";
import { placeRoute } from "@/lib/locations/placeRoute";
import { questSurfaceReturnTo } from "@/lib/quests/navigation";
import type { QuestBeatPresentation, QuestBeatStaging } from "@/lib/quests/presentation";
import { QUEST_BEAT_KIND_LABELS, type QuestBeat } from "@/types/quest.types";

const { beat, presentation, staging = null } = defineProps<{
  beat: QuestBeat;
  presentation?: QuestBeatPresentation;
  /** Where the beat is staged; null when it is staged nowhere. */
  staging?: QuestBeatStaging | null;
}>();
const emit = defineEmits<{ preview: [] }>();

const kindEyebrow = computed(() => `${QUEST_BEAT_KIND_LABELS[beat.kind as keyof typeof QUEST_BEAT_KIND_LABELS] ?? beat.kind} · ${beat.visibility}`);
const openTo = computed(() => ({
  path: `/quests/${beat.quest_id}/beats/${beat.id}`,
  query: { returnTo: questSurfaceReturnTo(beat.quest_id, beat.id, "work") },
}));
</script>
