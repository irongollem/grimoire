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
        <li v-for="event in events" :key="event.visit_id" class="relative min-w-0">
          <span aria-hidden="true" class="absolute -left-[1.3rem] top-2 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary sm:-left-[1.55rem]" />
          <article class="min-w-0 rounded-lg bg-muted/20 p-3">
            <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h5 class="text-label-lg font-semibold text-foreground">
                {{ event.visitNumber > 1 ? "Returned to this moment" : "Revealed story moment" }}
              </h5>
              <time :datetime="event.visited_at" class="text-2xs text-muted-foreground">{{ formatVisitTime(event.visited_at) }}</time>
            </div>
            <p class="mt-1 font-fell text-body leading-relaxed text-foreground">
              {{ event.player_text || "This moment was revealed without further public details." }}
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
const events = computed(() => {
  const visitCounts = new Map<string, number>();
  return safeBeats.value
    .filter((beat) => beat.visibility === "revealed")
    .flatMap((beat) => beat.visits.map((visit) => ({
      ...visit,
      beatId: beat.id,
      player_text: beat.player_text,
    })))
    .sort((a, b) => a.visited_at.localeCompare(b.visited_at) || a.visit_id.localeCompare(b.visit_id))
    .map((event) => {
      const visitNumber = (visitCounts.get(event.beatId) ?? 0) + 1;
      visitCounts.set(event.beatId, visitNumber);
      return { ...event, visitNumber };
    });
});

function formatVisitTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Visit recorded";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
</script>
