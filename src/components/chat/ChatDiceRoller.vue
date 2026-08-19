<template>
  <div class="shrink-0 border-t border-border bg-muted/20 px-3 py-2 space-y-2">
    <div class="flex flex-wrap gap-1">
      <AppButton
        v-for="d in ALL_DICE"
        :key="d"
        variant="subtle"
        surface="muted"
        size="xs"
        :active="(diceCounts[d] ?? 0) > 0"
        class="h-7 w-9 font-bold"
        :label="`d${d}`"
        @click="toggleDie(d)"
      />
    </div>
    <div v-if="totalDice > 0" class="flex flex-wrap gap-2">
      <div v-for="d in ALL_DICE" :key="d" class="flex items-center gap-1">
        <template v-if="(diceCounts[d] ?? 0) > 0">
          <span class="font-cinzel text-2xs text-muted-foreground">d{{ d }}:</span>
          <AppButton
            variant="ghost"
            fill="muted"
            size="icon-xs"
            :icon="IconMinus"
            icon-size="xs"
            :aria-label="`Decrease d${d} count`"
            @click="decrement(d)"
          />
          <span class="font-cinzel text-xs font-bold text-foreground w-4 text-center">{{ diceCounts[d] }}</span>
          <AppButton
            variant="ghost"
            fill="muted"
            size="icon-xs"
            :icon="IconAdd"
            icon-size="xs"
            :aria-label="`Increase d${d} count`"
            @click="increment(d)"
          />
        </template>
      </div>
    </div>
    <div class="flex items-center gap-2">
      <span class="font-cinzel text-2xs text-muted-foreground">Mod:</span>
      <AppButton
        variant="ghost"
        fill="muted"
        size="icon-xs"
        :icon="IconMinus"
        icon-size="xs"
        aria-label="Decrease modifier"
        @click="modifier--"
      />
      <AppInput
        v-model.number="modifier"
        type="number"
        size="xs"
        tone="default"
        align="center"
        :block="false"
        class="w-10 font-bold"
      />
      <AppButton
        variant="ghost"
        fill="muted"
        size="icon-xs"
        :icon="IconAdd"
        icon-size="xs"
        aria-label="Increase modifier"
        @click="modifier++"
      />
      <SegmentedControl
        v-model="mode"
        :options="MODES"
        variant="ghost"
        size="xs"
        class="ml-auto rounded border border-border overflow-hidden"
      />
    </div>
    <AppButton
      variant="primary"
      size="sm"
      block
      class="font-bold"
      :disabled="totalDice === 0"
      @click="onRoll"
    >
      🎲 Roll &amp; Post
    </AppButton>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import { ALL_DICE } from '@/lib/dice/dice';
import type { DieSize, RollMode } from '@/lib/dice/dice';
import { IconAdd, IconMinus } from '@/lib/icons';
import AppButton from '@/components/common/AppButton.vue';
import AppInput from '@/components/common/AppInput.vue';
import SegmentedControl from '@/components/common/SegmentedControl.vue';

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
