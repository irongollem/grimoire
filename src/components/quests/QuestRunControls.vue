<template>
  <nav class="sticky bottom-2 z-20 space-y-2 rounded-xl border border-border bg-background/95 p-3 shadow-lg backdrop-blur" aria-label="Quest runtime controls">
    <div v-if="outgoing.length > 1" class="grid gap-2 sm:grid-cols-2">
      <AppButton
        v-for="choice in outgoing"
        :key="choice.edge_id"
        :label="`${choice.label || 'Continue'} → ${choice.beat_title}`"
        variant="primary"
        :disabled="navigationDisabled"
        @click="emit('advance', choice.edge_id)"
      />
    </div>
    <div class="flex flex-wrap gap-2">
      <AppButton label="Previous" variant="subtle" :disabled="navigationDisabled || !hasPrevious" @click="emit('previous')" />
      <AppButton
        v-if="outgoing.length === 1"
        :label="`${outgoing[0].label || 'Next'} → ${outgoing[0].beat_title}`"
        variant="primary"
        :disabled="navigationDisabled"
        @click="emit('advance', outgoing[0].edge_id)"
      />
      <AppButton v-else-if="!outgoing.length" label="No authored next beat" variant="subtle" disabled />
      <AppButton label="Jump…" variant="subtle" :disabled="navigationDisabled" @click="emit('jump')" />
      <div class="ml-auto flex gap-2">
        <AppButton v-if="status === 'running'" label="Pause" variant="subtle" :disabled="disabled" @click="emit('pause')" />
        <AppButton v-else-if="status === 'paused'" label="Resume" variant="primary" :disabled="disabled" @click="emit('resume')" />
        <AppButton label="End" variant="destructive" :disabled="disabled" @click="emit('end')" />
      </div>
    </div>
    <p class="text-caption text-muted-foreground">Shortcuts: Alt+← previous · Alt+→ next when unambiguous · J jump</p>
  </nav>
</template>

<script setup lang="ts">
import type { QuestRuntimeChoice, QuestRuntimeStatus } from "@/types/quest.types";
import AppButton from "@/components/common/AppButton.vue";
import { computed } from "vue";

const props = defineProps<{ status: QuestRuntimeStatus; hasPrevious: boolean; outgoing: QuestRuntimeChoice[]; disabled?: boolean }>();
const navigationDisabled = computed(() => props.disabled || props.status !== "running");
const emit = defineEmits<{
  previous: [];
  advance: [edgeId: string];
  jump: [];
  pause: [];
  resume: [];
  end: [];
}>();
</script>
