<template>
  <div ref="root" class="condition-picker-wrap">
    <button
      type="button"
      class="picker-trigger"
      :class="open ? 'picker-trigger-open' : ''"
      :title="open ? 'Close condition picker' : 'Add / remove conditions'"
      @click.stop="open = !open"
    >+</button>

    <Transition name="picker-fade">
      <div v-if="open" class="picker-popover" @click.stop>
        <div class="picker-grid">
          <button
            v-for="cond in CONDITIONS"
            :key="cond"
            type="button"
            class="picker-chip"
            :class="isActive(cond) ? 'picker-chip-active' : 'picker-chip-inactive'"
            :title="getConditionShort(cond)"
            @click.stop="emit('pick', cond)"
          >{{ cond }}</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onClickOutside } from "@vueuse/core";
import { CONDITIONS, getExhaustionLevel, getConditionShort } from "@/lib/conditions";
import type { ConditionName } from "@/lib/conditions";

const props = defineProps<{
  /** Current active conditions for this combatant (the raw string[] from state). */
  conditions: string[];
}>();

const emit = defineEmits<{
  pick: [name: ConditionName];
}>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

onClickOutside(root, () => { open.value = false; });

function isActive(cond: ConditionName): boolean {
  if (cond === "Exhaustion") return getExhaustionLevel(props.conditions) > 0;
  return props.conditions.includes(cond);
}

/** Called from parent to close the picker (e.g. after a pick is handled). */
function close() { open.value = false; }

defineExpose({ close });
</script>

<style scoped>
@reference "@/assets/main.css";

.condition-picker-wrap {
  position: relative;
  display: inline-flex;
}

.picker-trigger {
  @apply w-5 h-5 rounded-full border border-dashed border-border text-muted-foreground font-cinzel text-xs flex items-center justify-center hover:border-primary hover:text-primary transition-colors;
}

.picker-trigger-open {
  @apply border-primary text-primary bg-primary/10;
}

.picker-popover {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  z-index: 50;
  @apply bg-card border border-border rounded-lg shadow-xl p-2;
  min-width: 14rem;
}

.picker-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.25rem;
}

.picker-chip {
  @apply font-cinzel text-[9px] font-semibold px-1.5 py-1 rounded border transition-colors text-center cursor-pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.picker-chip-active {
  @apply bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/50 hover:bg-destructive/15 hover:text-destructive hover:border-destructive/40;
}

.picker-chip-inactive {
  @apply bg-muted/40 text-muted-foreground border-border hover:bg-muted hover:text-foreground hover:border-border;
}

.picker-fade-enter-active,
.picker-fade-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}
.picker-fade-enter-from,
.picker-fade-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
