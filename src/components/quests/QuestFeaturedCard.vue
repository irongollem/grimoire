<template>
  <article class="rounded-lg border-2 border-primary bg-card p-4">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <RouterLink
            :to="`/quests/${quest.id}`"
            class="font-cinzel text-lg font-bold leading-tight text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-sm"
          >
            {{ quest.title || "Untitled Quest" }}
          </RouterLink>
          <span class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-2 py-0.5 text-label font-bold uppercase tracking-wider text-primary-foreground">
            <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-foreground" aria-hidden="true" />
            In session
          </span>
        </div>
        <p v-if="quest.summary" class="mt-1 font-fell text-sm italic leading-snug text-muted-foreground">
          {{ quest.summary }}
        </p>
      </div>

      <dl class="grid shrink-0 grid-cols-2 gap-x-5 gap-y-1 text-right sm:grid-cols-1">
        <div>
          <dt class="text-label uppercase tracking-wide text-muted-foreground">Beats</dt>
          <dd class="font-cinzel text-base font-bold text-foreground">{{ visitedBeatCount }} / {{ summary.beatSegments.length }}</dd>
        </div>
        <div>
          <dt class="text-label uppercase tracking-wide text-muted-foreground">Threads</dt>
          <dd class="font-cinzel text-base font-bold text-foreground">{{ summary.liveThreadCount }} live</dd>
        </div>
      </dl>
    </div>

    <!-- One spine row per live thread — the card has to answer "where is this
         quest" for more than one cursor at once (#850 story I). -->
    <div v-if="threadBadgesList.length" class="mt-3 flex flex-col gap-1.5">
      <div v-for="badge in threadBadgesList" :key="badge.thread.id" class="flex items-center gap-2">
        <span
          class="inline-flex w-24 shrink-0 items-center justify-center gap-1 rounded px-1.5 py-0.5 text-label font-semibold uppercase"
          :class="[badge.tone.bg, badge.tone.text]"
        >
          <IconThread class="h-3 w-3" aria-hidden="true" />
          Thread {{ badge.letter }}
        </span>
        <span
          v-for="(segment, index) in badge.thread.beatSegments"
          :key="index"
          class="h-1 flex-1 rounded-full"
          :class="segmentClass(segment, badge.tone)"
          aria-hidden="true"
        />
        <span class="w-40 shrink-0 truncate text-caption text-muted-foreground">
          {{ badge.thread.currentBeatTitle ?? "—" }}
        </span>
      </div>
    </div>

    <div class="mt-3 flex flex-wrap items-center gap-2">
      <span
        v-for="gap in gapChips"
        :key="gap.label"
        class="inline-flex items-center gap-1 rounded border border-dashed border-tone-caution/40 bg-tone-caution/10 px-1.5 py-0.5 text-label text-ink-caution"
      >
        <IconWarning class="h-3 w-3" aria-hidden="true" />
        {{ gap.label }}<template v-if="gap.count > 1"> × {{ gap.count }}</template>
      </span>
      <span
        v-if="summary.hasPayoffPrepared"
        class="inline-flex items-center gap-1 rounded bg-tone-success/10 px-1.5 py-0.5 text-label text-tone-success"
      >
        <IconCheck class="h-3 w-3" aria-hidden="true" />
        Payoff prepared
      </span>

      <AppButton
        class="ml-auto"
        variant="primary"
        size="sm"
        :icon="IconPlay"
        label="Resume run"
        :to="resumeRunTo"
      />
      <AppButton
        variant="subtle"
        size="sm"
        :icon="IconEdit"
        label="Story flow"
        :to="storyFlowTo"
      />
    </div>
  </article>
</template>

<script setup lang="ts">
/**
 * The frame `07 Log` top card: the one quest (or one of several) the table is
 * actually in right now, full width above the log's three groups. Unlike
 * `QuestBoardCard` this never renders without a summary — it only exists
 * because `summary.isLive` is true, so there is always at least one running
 * thread to show a spine for.
 *
 * Two facts from the mockup's statblock are deliberately absent: a next-session
 * date (no such field exists anywhere in the data — inventing one would be
 * lying about a date nobody set) and an Objectives N / M count (not part of
 * this story's `QuestBoardSummary` additions — `useQuestBoardSummaries` never
 * fetches `quest_objectives`, and adding that fetch is its own, separate
 * change). Both are called out here rather than silently dropped.
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import { IconCheck, IconEdit, IconNetwork as IconThread, IconPlay, IconWarning } from "@/lib/icons";
import { threadBadges, type ThreadTone } from "@/lib/quests/threads";
import type { QuestBeatSegment, QuestBoardSummary } from "@/lib/quests/board";
import type { Quest } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";

const { quest, summary } = defineProps<{
  quest: Quest;
  summary: QuestBoardSummary;
}>();

// One chip per kind of gap, not one per beat: six beats missing the same
// guidance is one alarm with a count, not six.
const gapChips = computed(() => {
  const counts = new Map<string, number>();
  for (const label of summary.prepGaps) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts].map(([label, count]) => ({ label, count }));
});

const visitedBeatCount = computed(() => summary.beatSegments.filter((segment) => segment === "done" || segment === "here").length);

// `QuestBoardThreadSummary` already carries everything `ThreadLike` needs
// (id/label/status/created_at) so the letter and tone this card paints a
// thread with are the same ones the cockpit and the graph assign it —
// centralised in `threads.ts`, never chosen locally.
const threadBadgesList = computed(() => threadBadges(summary.threads));

function segmentClass(segment: QuestBeatSegment, tone: ThreadTone) {
  if (segment === "done") return "bg-tone-success";
  if (segment === "here") return tone.dot;
  if (segment === "gap") return "quest-featured-segment-gap";
  return "bg-muted";
}

const resumeRunTo = computed(() => ({
  path: `/quests/${quest.id}`,
  query: {
    mode: "run",
    ...(summary.primaryThreadId ? { thread: summary.primaryThreadId } : {}),
  },
}));

const storyFlowTo = computed(() => ({ path: `/quests/${quest.id}`, query: { view: "work" } }));
</script>

<style scoped>
.quest-featured-segment-gap {
  background: repeating-linear-gradient(
    90deg,
    color-mix(in oklab, var(--color-tone-caution) 65%, transparent) 0 0.25rem,
    transparent 0.25rem 0.5rem
  );
}
</style>
