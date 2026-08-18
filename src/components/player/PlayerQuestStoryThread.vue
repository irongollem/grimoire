<template>
  <section aria-labelledby="quest-story-heading" class="space-y-4 rounded-xl border border-border bg-card p-3 sm:p-4">
    <div>
      <h3 id="quest-story-heading" class="font-cinzel text-base font-bold text-foreground">Story so far</h3>
      <p class="text-caption text-muted-foreground">Only moments the party has learned or lived through appear here.</p>
    </div>

    <section v-if="rumors.length" aria-labelledby="quest-rumors-heading" class="space-y-2 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3">
      <h4 id="quest-rumors-heading" class="text-label-lg font-semibold uppercase tracking-wide text-primary">Rumors</h4>
      <ul class="space-y-2">
        <li v-for="beat in rumors" :key="beat.id" class="font-fell text-body italic leading-relaxed text-foreground">
          {{ beat.player_text || "A rumor is circulating, but its details have not been shared yet." }}
        </li>
      </ul>
    </section>

    <div class="space-y-2">
      <h4 class="text-label-lg font-semibold text-muted-foreground">Confirmed journey</h4>
      <ol v-if="events.length" aria-label="Revealed quest history" class="relative space-y-3 border-l border-border pl-4 sm:pl-5">
        <li v-for="event in events" :key="event.beatId" class="relative min-w-0">
          <span aria-hidden="true" class="absolute -left-[1.3rem] top-2 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary sm:-left-[1.55rem]" />
          <article class="min-w-0 rounded-lg bg-muted/20 p-3">
            <p class="font-fell text-body leading-relaxed text-foreground">{{ event.playerText }}</p>
            <p class="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-2xs text-muted-foreground">
              <time :datetime="event.occurredAt">{{ formatVisitTime(event.occurredAt) }}</time>
              <span v-if="event.visitCount > 1">· Returned to this moment {{ event.visitCount }} times</span>
            </p>
          </article>
        </li>
      </ol>
      <p v-else class="rounded-lg bg-muted/20 p-3 text-body italic text-muted-foreground">
        No confirmed story moments have been revealed yet.
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { PlayerQuestBeat } from "@/types/quest.types";

const props = defineProps<{ beats: PlayerQuestBeat[] }>();

// Keep this defensive even though the RPC filters visibility: malformed cache
// data must not turn a hidden node into player-facing copy.
const safeBeats = computed(() => props.beats.filter((beat) => beat.visibility === "rumored" || beat.visibility === "revealed"));
const rumors = computed(() => safeBeats.value.filter((beat) => beat.visibility === "rumored"));

/**
 * One entry per revealed beat, in the order the story runs.
 *
 * It used to be one entry per *visit*, sorted by time — and for a beat the party
 * never visited, "time" was `updated_at`, the moment the DM clicked reveal. A DM
 * catching the log up after a session therefore got a recap in the order they
 * happened to tick the boxes, contradicting the story it was describing. Order
 * now comes from `story_order`, the beat's position in the authored flow.
 *
 * Repeat visits fold into a count rather than becoming separate entries. Split
 * out, a loop back through an earlier beat lands that beat's second entry ahead
 * of scenes the party had already played, which reads as if they never left.
 *
 * A revealed beat with no player copy is dropped rather than rendered as
 * "This moment was revealed without further public details" — a card that says
 * nothing is worse than no card. The DM is told: an empty reveal is already a
 * prep gap on the beat.
 */
const events = computed(() => safeBeats.value
  .filter((beat) => beat.visibility === "revealed" && !!beat.player_text)
  .map((beat) => {
    const firstVisit = beat.visits.map((visit) => visit.visited_at).sort()[0];
    return {
      beatId: beat.id,
      playerText: beat.player_text!,
      occurredAt: firstVisit ?? beat.updated_at,
      visitCount: beat.visits.length,
      storyOrder: beat.story_order,
    };
  })
  .sort((a, b) => a.storyOrder - b.storyOrder || a.occurredAt.localeCompare(b.occurredAt) || a.beatId.localeCompare(b.beatId)));

function formatVisitTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Visit recorded";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
</script>
