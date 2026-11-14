<template>
  <section class="flex flex-col gap-2" aria-label="Where it can go">
    <h3 class="text-body font-bold text-foreground">Where it can go</h3>
    <p v-if="!routes.length" class="text-caption text-muted-foreground">No routes out yet.</p>
    <template v-else>
      <div v-if="choices.length" class="flex flex-col gap-1">
        <p v-if="choices.length > 1" class="text-caption text-muted-foreground">They choose one</p>
        <ul class="flex flex-col gap-1.5 border-l-2 border-foreground" aria-label="Choices">
          <QuestBeatWay v-for="edge in choices" :key="edge.id" :edge="edge" :target-title="titleOf(edge)" :can-take="canTake" @select-beat="emit('select-beat', $event)" @select-edge="emit('select-edge', $event)" @take="emit('take', $event)" />
        </ul>
      </div>
      <div v-if="parallels.length" class="flex flex-col gap-1">
        <p class="text-caption text-muted-foreground">And also</p>
        <ul class="flex flex-col gap-1.5 border-l-2 border-dashed border-foreground" aria-label="Alongside">
          <QuestBeatWay v-for="edge in parallels" :key="edge.id" :edge="edge" :target-title="titleOf(edge)" :can-take="canTake" dashed @select-beat="emit('select-beat', $event)" @select-edge="emit('select-edge', $event)" @take="emit('take', $event)" />
        </ul>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";
import QuestBeatWay from "./QuestBeatWay.vue";

/**
 * "Where it can go" (#1194, frame 09): the routes out of one beat, drawn as a
 * fork. Choices share a solid stem ("They choose one" when there are several),
 * parallel routes a dashed one ("And also"). Take shows only when the party is
 * here and the run can advance.
 */
const { beatId, edges, beats, canTake = false } = defineProps<{
  beatId: string;
  edges: QuestBeatEdge[];
  beats: Pick<QuestBeat, "id" | "title">[];
  /** The party stands at this beat on the focus thread and the runtime can advance. */
  canTake?: boolean;
}>();
const emit = defineEmits<{ "select-beat": [beatId: string]; "select-edge": [edgeId: string]; take: [edgeId: string] }>();

const routes = computed(() => edges.filter((edge) => edge.source_beat_id === beatId));
const choices = computed(() => routes.value.filter((edge) => edge.route_kind === "choice"));
const parallels = computed(() => routes.value.filter((edge) => edge.route_kind === "parallel"));

function titleOf(edge: QuestBeatEdge): string {
  const title = beats.find((row) => row.id === edge.target_beat_id)?.title;
  return title && title.trim() !== "" ? title : "Untitled beat";
}
</script>
