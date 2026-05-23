<template>
  <div
    v-if="hasMember"
    class="rounded-lg border border-border bg-card px-4 py-3 flex gap-3 items-center"
  >
    <!-- Burden portrait -->
    <div class="shrink-0 w-15 h-21 select-none">
      <img
        :src="BURDEN_META[burdenLevel].img"
        :alt="BURDEN_META[burdenLevel].label"
        class="w-full h-full object-contain object-top transition-opacity duration-300"
      />
    </div>

    <!-- Bar + labels -->
    <div class="flex-1 min-w-0">
      <div class="flex items-center justify-between mb-1 gap-2">
        <!-- Burden label -->
        <span
          class="font-cinzel text-2xs md:text-sm font-semibold tracking-wider transition-colors"
          :class="BURDEN_META[burdenLevel].color"
        >
          {{ BURDEN_META[burdenLevel].label }}
        </span>

        <!-- weight / capacity + powerful build -->
        <div class="flex items-center gap-1.5 shrink-0">
          <span
            v-if="powerfulBuild"
            class="font-cinzel text-2xs md:text-sm text-amber-400/70 tracking-wider uppercase"
          >Powerful Build</span>
          <span class="font-cinzel text-2xs md:text-sm text-foreground">{{ formatWeightLb(totalCarriedWeight) }}</span>
          <span class="font-cinzel text-2xs md:text-sm text-muted-foreground/40">/</span>

          <!-- editable capacity -->
          <form
            v-if="editingCapacity"
            class="flex items-center gap-1"
            @submit.prevent="$emit('save-capacity', capacityDraft)"
          >
            <input
              :value="capacityDraft"
              type="text"
              placeholder="*2 / +30 / 150"
              class="w-20 bg-muted/30 border border-border rounded px-1 py-0 font-cinzel text-2xs md:text-sm text-foreground text-center focus:outline-none focus:ring-1 focus:ring-ring"
              autofocus
              @input="$emit('update-capacity-draft', ($event.target as HTMLInputElement).value)"
              @keydown.escape="$emit('cancel-capacity')"
            />
            <button
              type="submit"
              class="font-cinzel text-2xs md:text-sm text-primary hover:opacity-70"
            >✓</button>
            <button
              v-if="hasCapacityOverride"
              type="button"
              class="font-cinzel text-2xs md:text-sm text-muted-foreground hover:text-foreground"
              title="Reset to STR×15"
              @click="$emit('reset-capacity')"
            >↺</button>
            <button
              type="button"
              class="font-cinzel text-2xs md:text-sm text-muted-foreground hover:text-foreground"
              @click="$emit('cancel-capacity')"
            >✕</button>
          </form>
          <button
            v-else
            class="font-cinzel text-2xs md:text-sm hover:text-primary transition-colors flex items-center gap-0.5"
            :class="hasCapacityOverride ? 'text-amber-400' : 'text-muted-foreground/60'"
            @click="$emit('open-capacity')"
          >
            {{ formatWeightLb(effectiveCapacity) }}
            <span v-if="hasCapacityOverride" class="text-2xs md:text-sm opacity-60">({{ capacityOverride }})</span>
          </button>
        </div>
      </div>

      <!-- bar + threshold markers -->
      <div class="relative">
        <div class="h-1.5 rounded-full bg-muted/40 overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-300"
            :class="carryColor"
            :style="{ width: carryPercent + '%' }"
          />
        </div>
        <!-- tick marks -->
        <div
          class="absolute top-0 h-1.5 w-px bg-foreground/20 pointer-events-none"
          :style="{ left: encumberedMarkerPct + '%' }"
        />
        <div
          class="absolute top-0 h-1.5 w-px bg-foreground/20 pointer-events-none"
          :style="{ left: heavyMarkerPct + '%' }"
        />
        <!-- threshold labels -->
        <div class="relative h-3.5 mt-0.5" aria-hidden="true">
          <span
            class="absolute font-cinzel text-2xs md:text-sm text-muted-foreground/40 -translate-x-1/2 whitespace-nowrap"
            :style="{ left: encumberedMarkerPct + '%' }"
          >{{ formatWeightLb(encumberedThreshold) }}</span>
          <span
            class="absolute font-cinzel text-2xs md:text-sm text-muted-foreground/40 -translate-x-1/2 whitespace-nowrap"
            :style="{ left: heavyMarkerPct + '%' }"
          >{{ formatWeightLb(heavyThreshold) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatWeightLb } from '@/lib/utils';

type BurdenLevel = 'unencumbered' | 'encumbered' | 'heavily_encumbered' | 'over_encumbered';

const BURDEN_META: Record<BurdenLevel, { label: string; img: string; color: string }> = {
  unencumbered: { label: 'Unencumbered', img: '/assets/unencumbered.webp', color: 'text-green-500' },
  encumbered: { label: 'Encumbered', img: '/assets/encumbered.webp', color: 'text-amber-400' },
  heavily_encumbered: { label: 'Heavily Encumbered', img: '/assets/heavily_encumbered.webp', color: 'text-orange-500' },
  over_encumbered: { label: 'Over Encumbered', img: '/assets/over_encumbered.webp', color: 'text-destructive' },
};

const {
  hasMember,
  burdenLevel,
  powerfulBuild,
  totalCarriedWeight,
  effectiveCapacity,
  carryPercent,
  carryColor,
  encumberedThreshold,
  heavyThreshold,
  encumberedMarkerPct,
  heavyMarkerPct,
  editingCapacity,
  capacityDraft,
  hasCapacityOverride,
  capacityOverride,
} = defineProps<{
  hasMember: boolean;
  burdenLevel: BurdenLevel;
  powerfulBuild: boolean;
  totalCarriedWeight: number;
  effectiveCapacity: number;
  carryPercent: number;
  carryColor: string;
  encumberedThreshold: number;
  heavyThreshold: number;
  encumberedMarkerPct: number;
  heavyMarkerPct: number;
  editingCapacity: boolean;
  capacityDraft: string;
  hasCapacityOverride: boolean;
  capacityOverride: string | null;
}>();

defineEmits<{
  'open-capacity': [];
  'save-capacity': [draft: string];
  'reset-capacity': [];
  'cancel-capacity': [];
  'update-capacity-draft': [value: string];
}>();
</script>
