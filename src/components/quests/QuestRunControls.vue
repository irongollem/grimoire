<template>
  <nav class="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/95 p-3" aria-label="Quest runtime controls">
    <AppButton label="Previous" variant="subtle" :disabled="navigationDisabled || !hasPrevious" @click="emit('previous')" />
    <AppButton label="Jump…" variant="subtle" :disabled="navigationDisabled" @click="emit('jump')" />
    <div class="ml-auto flex gap-2">
      <AppButton v-if="status === 'running'" label="Pause" variant="subtle" :disabled="disabled" @click="emit('pause')" />
      <AppButton v-else-if="status === 'paused'" label="Resume" variant="primary" :disabled="disabled" @click="emit('resume')" />
      <AppButton label="End" variant="destructive" :disabled="disabled" @click="emit('end')" />
    </div>
    <p class="basis-full text-caption text-muted-foreground">Shortcuts: Alt+← previous · Alt+→ next when exactly one route is open · J jump</p>
  </nav>
</template>

<script setup lang="ts">
/**
 * The run cockpit's session-wide commands — Previous, Jump, Pause/Resume,
 * End — kept apart from `QuestRunOutcomeStrip`'s per-route branch cards
 * (#820, epic #780). None of these is an outcome of the current beat, so
 * none belongs in the strip that concern owns.
 *
 * Deliberately not `sticky` (#776): a floating bar pinned to a clipped
 * viewport is exactly the bug that issue fixed once, and this bar's own
 * content is short enough to sit in normal flow without needing to float.
 */
import { computed } from "vue";
import type { QuestRuntimeStatus } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";

const props = defineProps<{ status: QuestRuntimeStatus; hasPrevious: boolean; disabled?: boolean }>();
const navigationDisabled = computed(() => props.disabled || props.status !== "running");
const emit = defineEmits<{
  previous: [];
  jump: [];
  pause: [];
  resume: [];
  end: [];
}>();
</script>
