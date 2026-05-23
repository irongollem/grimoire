<template>
  <div class="shrink-0 border-t border-border bg-muted/20 px-3 py-2 space-y-2">
    <div class="flex flex-wrap gap-1">
      <button
        v-for="d in ALL_DICE"
        :key="d"
        type="button"
        class="h-7 w-9 rounded border font-cinzel text-[10px] font-bold transition-colors"
        :class="
          (diceCounts[d] ?? 0) > 0
            ? 'border-primary/60 bg-primary/15 text-primary'
            : 'border-border bg-muted/40 text-muted-foreground hover:border-primary/40'
        "
        @click="toggleDie(d)"
      >
        d{{ d }}
      </button>
    </div>
    <div v-if="totalDice > 0" class="flex flex-wrap gap-2">
      <div v-for="d in ALL_DICE" :key="d" class="flex items-center gap-1">
        <template v-if="(diceCounts[d] ?? 0) > 0">
          <span class="font-cinzel text-[10px] text-muted-foreground">d{{ d }}:</span>
          <button type="button" class="count-btn" @click="decrement(d)">−</button>
          <span class="font-cinzel text-xs font-bold text-foreground w-4 text-center">{{ diceCounts[d] }}</span>
          <button type="button" class="count-btn" @click="increment(d)">+</button>
        </template>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <span class="font-cinzel text-[10px] text-muted-foreground">Mod:</span>
      <button type="button" class="count-btn" @click="modifier--">−</button>
      <input
        v-model.number="modifier"
        type="number"
        class="w-10 text-center bg-background border border-border rounded px-1 py-0.5 font-cinzel text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <button type="button" class="count-btn" @click="modifier++">+</button>
      <div class="flex rounded border border-border overflow-hidden ml-auto">
        <button
          v-for="m in MODES"
          :key="m.value"
          type="button"
          class="px-2 py-0.5 font-cinzel text-[9px] font-bold tracking-wider transition-colors"
          :class="
            mode === m.value
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="mode = m.value"
        >
          {{ m.label }}
        </button>
      </div>
    </div>
    <button
      type="button"
      :disabled="totalDice === 0"
      class="w-full py-1.5 font-cinzel text-xs font-bold tracking-wider bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-40"
      @click="onRoll"
    >
      🎲 Roll &amp; Post
    </button>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import { ALL_DICE } from '@/lib/dice';
import type { DieSize, RollMode } from '@/lib/dice';

const emit = defineEmits<{
  roll: [payload: { counts: Partial<Record<DieSize, number>>; modifier: number; mode: RollMode }];
}>();

const MODES: { value: RollMode; label: string }[] = [
  { value: 'disadvantage', label: 'DIS' },
  { value: 'normal', label: 'NRM' },
  { value: 'advantage', label: 'ADV' },
];

const diceCounts = reactive<Partial<Record<DieSize, number>>>({});
const modifier = ref(0);
const mode = ref<RollMode>('normal');

const totalDice = computed(() =>
  ALL_DICE.reduce((s, d) => s + (diceCounts[d] ?? 0), 0),
);

function toggleDie(d: DieSize) {
  diceCounts[d] = (diceCounts[d] ?? 0) > 0 ? 0 : 1;
}
function increment(d: DieSize) {
  diceCounts[d] = Math.min((diceCounts[d] ?? 0) + 1, 9);
}
function decrement(d: DieSize) {
  diceCounts[d] = Math.max((diceCounts[d] ?? 0) - 1, 0);
}

function onRoll() {
  if (totalDice.value === 0) return;
  emit('roll', { counts: { ...diceCounts }, modifier: modifier.value, mode: mode.value });
}
</script>

<style scoped>
@reference "@/assets/main.css";

.count-btn {
  @apply w-5 h-5 rounded bg-muted border border-border font-cinzel text-xs flex items-center justify-center hover:bg-card transition-colors leading-none;
}
</style>
