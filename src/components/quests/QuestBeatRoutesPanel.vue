<template>
  <section class="rounded-xl border border-border bg-card p-3" aria-label="Routes out">
    <header class="flex items-center gap-2">
      <h3 class="font-cinzel text-sm font-bold text-foreground">Routes out</h3>
      <span class="ml-auto rounded bg-primary/15 px-1.5 py-0.5 text-label uppercase text-primary">{{ summaryChip }}</span>
    </header>

    <ul v-if="outgoing.length" class="mt-2 space-y-1.5">
      <li
        v-for="route in outgoing"
        :key="route.edge.id"
        class="rounded-md border p-2 text-caption"
        :class="route.edge.route_kind === 'parallel' ? 'border-tone-info/50 bg-tone-info/5' : 'border-border bg-card'"
      >
        <div class="flex flex-wrap items-center gap-1.5">
          <span
            class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-label uppercase"
            :class="route.edge.route_kind === 'parallel' ? 'bg-tone-info/15 text-ink-info' : 'bg-primary/15 text-primary'"
          >
            <component :is="route.edge.route_kind === 'parallel' ? IconLayers : IconShuffle" class="h-3 w-3" />
            {{ route.edge.route_kind }}
          </span>
          <span class="rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">{{ route.targetKind }}</span>
          <span v-if="route.edge.route_kind === 'parallel' && route.edge.thread_label" class="rounded bg-tone-info/15 px-1.5 py-0.5 text-label uppercase text-ink-info">
            opens {{ route.edge.thread_label }}
          </span>
          <span v-if="route.site && route.site.roomCount > 0" class="ml-auto text-label text-ink-info">site · {{ route.site.roomCount }} room{{ route.site.roomCount === 1 ? '' : 's' }}</span>
        </div>
        <h4 class="mt-1 font-cinzel text-label-lg font-bold text-foreground">{{ route.targetTitle }}</h4>
        <p class="text-muted-foreground">{{ route.caption }}</p>
        <div class="mt-1 flex justify-end">
          <AppButton :to="editRouteTo(route.edge.id)" label="Edit route" size="xs" variant="subtle" />
        </div>
      </li>
    </ul>
    <p v-else class="mt-2 rounded-md border border-dashed border-border p-3 text-center text-caption text-muted-foreground">No routes out of this beat yet.</p>

    <div class="mt-2 flex justify-center">
      <AppButton :to="addRouteTo" label="Add route" :icon="IconAdd" size="xs" variant="subtle" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useLocationTree } from "@/composables/locations/useLocations";
import { isSiteType } from "@/lib/locations/tiers";
import { IconAdd, IconLayers, IconShuffle } from "@/lib/icons";
import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";

const { beat, edges, beats } = defineProps<{
  beat: QuestBeat;
  /** Every edge in the quest — outgoing routes are filtered from this. */
  edges: QuestBeatEdge[];
  beats: QuestBeat[];
}>();

const { locationOptions } = useLocationTree();

function beatById(id: string): QuestBeat | undefined {
  return beats.find((candidate) => candidate.id === id);
}

function siteFacts(locationId: string | null) {
  const location = locationId ? locationOptions.value.find((candidate) => candidate.id === locationId) : undefined;
  if (!location || !isSiteType(location.location_type)) return null;
  const roomCount = locationOptions.value.filter((candidate) => candidate.parent_id === location.id && candidate.location_type === "room").length;
  return { roomCount };
}

const outgoing = computed(() => edges
  .filter((edge) => edge.source_beat_id === beat.id)
  .map((edge) => {
    const target = beatById(edge.target_beat_id);
    const caption = edge.route_kind === "parallel"
      ? "Opens whichever choice fires. This beat's own thread is untouched — this is the layer that appears without abandoning the tree."
      : `→ ${target?.title || "Missing beat"} · cursor moves, the thread continues`;
    return {
      edge,
      targetTitle: target?.title || "Missing beat",
      targetKind: target?.kind || "neutral",
      site: siteFacts(target?.staged_at_location_id ?? null),
      caption,
    };
  }));

const summaryChip = computed(() => {
  const choiceCount = outgoing.value.filter((route) => route.edge.route_kind === "choice").length;
  const parallelCount = outgoing.value.filter((route) => route.edge.route_kind === "parallel").length;
  return `${choiceCount} choice · ${parallelCount} parallel`;
});

function workQuery(extra: Record<string, string> = {}) {
  return { path: `/quests/${beat.quest_id}`, query: { view: "work", beat: beat.id, ...extra } };
}
// The designer restores `?beat=`; it does not yet restore `?edge=` to select
// a specific route on load (that half belongs to the designer's own owner).
// The link still carries it — a future designer read of this param needs no
// change here.
function editRouteTo(edgeId: string) {
  return workQuery({ edge: edgeId });
}
const addRouteTo = computed(() => workQuery());
</script>
