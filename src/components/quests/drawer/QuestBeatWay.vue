<template>
  <li class="relative flex flex-col gap-0.5 pl-4">
    <span class="absolute left-0 top-3 h-0 w-3 border-t-2 border-foreground" :class="dashed && 'border-dashed'" aria-hidden="true" />
    <div class="flex min-w-0 items-center gap-2">
      <!-- What the party does reads as text in ink; the gold link is the place it leads. -->
      <AppButton variant="link" size="inline-body" class="min-w-0 flex-1 justify-start truncate text-left font-bold text-foreground" :label="heading" @click="emit('select-edge', edge.id)" />
      <!-- An unlabelled route's heading already names its target ("To …"), so the target is not said twice. -->
      <AppButton v-if="hasLabel" variant="link" size="inline-caption" class="max-w-[45%] shrink-0 truncate" :label="targetTitle" :aria-label="`Go to ${targetTitle}`" @click="emit('select-beat', edge.target_beat_id)" />
      <AppButton v-if="canTake" size="xs" label="Take" :aria-label="`Take ${heading}`" @click="emit('take', edge.id)" />
    </div>
    <p v-if="edge.note" class="text-caption text-muted-foreground">{{ edge.note }}</p>
  </li>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import type { QuestBeatEdge } from "@/types/quest.types";

/** One route of the fork: what the party does, where it leads, what it costs. */
const { edge, targetTitle, canTake = false, dashed = false } = defineProps<{
  edge: QuestBeatEdge;
  targetTitle: string;
  canTake?: boolean;
  dashed?: boolean;
}>();
const emit = defineEmits<{ "select-beat": [beatId: string]; "select-edge": [edgeId: string]; take: [edgeId: string] }>();

const hasLabel = computed(() => !!edge.label && edge.label.trim() !== "");
const heading = computed(() => (hasLabel.value && edge.label ? edge.label : `To ${targetTitle}`));
</script>
