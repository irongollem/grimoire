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
          class="text-label font-semibold transition-colors"
          :class="BURDEN_META[burdenLevel].color"
        >
          {{ BURDEN_META[burdenLevel].label }}
        </span>

        <!-- weight / capacity + powerful build -->
        <div class="flex items-center gap-1.5 shrink-0">
          <span
            v-if="powerfulBuild"
            class="text-eyebrow text-amber-400/70"
          >Powerful Build</span>
          <span class="font-cinzel text-2xs text-foreground">{{ formatWeightLb(totalCarriedWeight) }}</span>
          <span class="font-cinzel text-2xs text-muted-foreground/40">/</span>

          <!-- editable capacity -->
          <form
            v-if="editingCapacity"
            class="flex items-center gap-1"
            @submit.prevent="$emit('save-capacity', capacityDraft)"
          >
            <AppInput
              v-model="capacityDraftModel"
              size="xs"
              tone="muted"
              align="center"
              placeholder="*2 / +30 / 150"
              autofocus
              class="w-20"
              @keydown.escape="$emit('cancel-capacity')"
            />
            <AppButton type="submit" variant="link" size="inline-xs" label="✓" />
            <AppButton
              v-if="hasCapacityOverride"
              variant="ghost"
              size="inline-xs"
              label="↺"
              tooltip="Reset to STR×15"
              @click="$emit('reset-capacity')"
            />
            <AppButton variant="ghost" size="inline-xs" label="✕" @click="$emit('cancel-capacity')" />
          </form>
          <AppButton
            v-else
            variant="ghost"
            size="inline-xs"
            :class="hasCapacityOverride ? 'text-amber-400 hover:text-amber-400' : ''"
            @click="$emit('open-capacity')"
          >
            {{ formatWeightLb(effectiveCapacity) }}
            <span v-if="hasCapacityOverride" class="opacity-60">({{ capacityOverride }})</span>
          </AppButton>
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
            class="absolute font-cinzel text-2xs text-muted-foreground/40 -translate-x-1/2 whitespace-nowrap"
            :style="{ left: encumberedMarkerPct + '%' }"
          >{{ formatWeightLb(encumberedThreshold) }}</span>
          <span
            class="absolute font-cinzel text-2xs text-muted-foreground/40 -translate-x-1/2 whitespace-nowrap"
            :style="{ left: heavyMarkerPct + '%' }"
          >{{ formatWeightLb(heavyThreshold) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatWeightLb } from '@/lib/utils';
import AppButton from '@/components/common/AppButton.vue';
import AppInput from '@/components/common/AppInput.vue';

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

const emit = defineEmits<{
  'open-capacity': [];
  'save-capacity': [draft: string];
  'reset-capacity': [];
  'cancel-capacity': [];
  'update-capacity-draft': [value: string];
}>();

// AppInput needs a v-model; capacityDraft is a prop owned by the parent (form
// state lives there so Enter/Escape/blur can all resolve it), so this just
// re-routes v-model's get/set through the existing update-capacity-draft emit.
const capacityDraftModel = computed({
  get: () => capacityDraft,
  set: (value: string) => emit('update-capacity-draft', value),
});
</script>
