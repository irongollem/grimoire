<template>
  <Transition name="roll-fade">
    <div v-if="lastCheck" class="roll-result-banner" :class="rollResultClass">
      <div class="roll-result-total">
        <DiceResult :value="lastCheck.total" :is-crit="lastCheck.isCrit" :is-fumble="lastCheck.isFumble" />
      </div>
      <div class="roll-result-info">
        <span class="roll-result-label">{{ lastCheck.label }}</span>
        <span class="roll-result-breakdown">
          <span class="roll-die" :class="{ 'roll-die-drop': lastCheck.dropped !== undefined }">{{ lastCheck.d20 }}</span>
          <span v-if="lastCheck.dropped !== undefined" class="roll-die roll-die-drop">{{ lastCheck.dropped }}</span>
          <span v-if="lastCheck.modifier !== 0" class="roll-mod">{{ lastCheck.modifier >= 0 ? '+' : '' }}{{ lastCheck.modifier }}</span>
        </span>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from "vue";
import DiceResult from "@/components/common/DiceResult.vue";

export interface CheckResult {
  total: number;
  label: string;
  modifier: number;
  d20: number;
  dropped?: number;
  isCrit: boolean;
  isFumble: boolean;
}

const { lastCheck } = defineProps<{
  lastCheck: CheckResult | null;
}>();

const rollResultClass = computed(() => {
  if (!lastCheck) return "";
  if (lastCheck.isCrit) return "roll-crit";
  if (lastCheck.isFumble) return "roll-fumble";
  return "";
});
</script>

<style scoped>
@reference "@/assets/main.css";

.roll-result-banner {
  @apply flex items-center gap-3 px-3 py-2 border-b border-border bg-muted/30 shrink-0;
}
.roll-result-total {
  @apply font-cinzel text-2xl font-bold text-foreground min-w-10 text-center;
}
.roll-crit .roll-result-total   { @apply text-amber-500; }
.roll-fumble .roll-result-total { @apply text-destructive; }
.roll-result-info {
  @apply flex flex-col;
}
.roll-result-label {
  @apply font-cinzel text-2xs font-bold tracking-wider text-muted-foreground uppercase;
}
.roll-result-breakdown {
  @apply flex items-center gap-1 flex-wrap;
}
.roll-die {
  @apply font-cinzel text-xs font-bold text-foreground bg-muted rounded px-1.5 py-0.5;
}
.roll-die-drop {
  @apply line-through opacity-40;
}
.roll-mod {
  @apply font-cinzel text-xs text-primary font-semibold;
}

.roll-fade-enter-active,
.roll-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.roll-fade-enter-from,
.roll-fade-leave-to {
  opacity: 0;
  transform: translateY(-0.25rem);
}
</style>
