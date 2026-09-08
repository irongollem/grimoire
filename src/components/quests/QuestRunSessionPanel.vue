<template>
  <section class="space-y-2 rounded-xl border border-border bg-card p-3" aria-label="Session">
    <h3 class="font-cinzel text-sm font-bold text-foreground">Session</h3>
    <div class="flex flex-wrap gap-2">
      <AppButton label="Previous" size="sm" variant="subtle" :disabled="navigationDisabled || !hasPrevious" @click="emit('previous')" />
      <AppButton label="Jump…" size="sm" variant="subtle" :disabled="navigationDisabled" @click="emit('jump')" />
      <AppButton v-if="status === 'running'" label="Pause" size="sm" variant="subtle" :disabled="disabled" @click="emit('pause')" />
      <AppButton v-else-if="status === 'paused'" label="Resume" size="sm" variant="primary" :disabled="disabled" @click="emit('resume')" />
      <AppButton label="End session" size="sm" variant="link" tone="danger" :disabled="disabled" @click="emit('end')" />
    </div>
    <p class="text-caption text-muted-foreground">Shortcuts: Alt+← previous · Alt+→ next when exactly one route is open · J jump</p>
  </section>
</template>

<script setup lang="ts">
/**
 * The cockpit's session-wide commands — Previous, Jump, Pause/Resume, End —
 * kept apart from the "What happens next" cards, which are outcomes of the
 * current beat rather than the table. Formerly `QuestRunControls`, a bar
 * docked at the foot of the whole cockpit; it is a card in the left column
 * now, under Held payoff, which is where the redesign's `[1fr · 20rem]`
 * grid puts it (#853, story F).
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
