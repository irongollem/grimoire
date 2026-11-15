<template>
  <CartographerOptionsSlip title="Walls found in the picture">
    <p v-if="proposed > 0" class="basis-full text-caption text-muted-foreground">
      {{ proposed === 1 ? "1 ring proposed." : `${proposed} rings proposed.` }} Nothing is a wall until you keep it.
    </p>
    <p v-else class="basis-full text-caption text-ink-caution">
      No outline found. The picture may fill its page edge to edge. Raise the sensitivity, or trace the walls by hand.
    </p>

    <div class="flex basis-full flex-wrap items-center gap-1.5">
      <AppButton v-if="proposed > 0" variant="primary" size="sm" :label="keepLabel" :disabled="kept === 0" @click="emit('apply')" />
      <AppButton
        v-if="proposed > 0"
        variant="ghost"
        fill="muted"
        size="sm"
        :label="kept > 0 ? 'Drop all' : 'Keep all'"
        @click="kept > 0 ? emit('drop-all') : emit('keep-all')"
      />
      <AppButton variant="ghost" fill="muted" size="sm" label="Cancel" @click="emit('cancel')" />
    </div>

    <div class="flex basis-full items-center gap-1.5">
      <RangeControl
        id="wall-finder-sensitivity"
        v-model="tolerance"
        label="Sensitivity"
        :min="0.05"
        :max="0.8"
        :step="0.05"
        :readout="`${Math.round(tolerance * 100)}%`"
      />
    </div>
    <div class="flex basis-full items-center gap-1.5">
      <RangeControl
        id="wall-finder-inset"
        v-model="inset"
        label="Pull in"
        :min="0"
        :max="0.5"
        :step="0.05"
        :readout="`${+(inset * FEET_PER_CELL).toFixed(2)} ft`"
      />
    </div>
    <AppCheckbox v-model="snapToGrid" label="Snap to the grid" size="sm" />

    <p class="basis-full text-caption-sm text-muted-foreground">
      This finds the outline of the map. Walls between rooms are yours to trace: click a ring on the map to drop or keep it.
    </p>
  </CartographerOptionsSlip>
</template>

<script setup lang="ts">
// The slip while walls are being found in the picture (#1197, canvas Picture Maps frame 07): what was proposed, the
// three things that change the proposal, and the choice to keep it. It holds no state of its own: the finder does.
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import CartographerOptionsSlip from "@/components/cartographer/CartographerOptionsSlip.vue";
import RangeControl from "@/components/cartographer/RangeControl.vue";
import { FEET_PER_CELL } from "@/cartographer/packSchema";

const { proposed, kept } = defineProps<{
  /** How many rings the picture gave. */
  proposed: number;
  /** How many of them are kept. */
  kept: number;
}>();

/** How far a colour may be from the page's and still count as page (0 to 1). */
const tolerance = defineModel<number>("tolerance", { required: true });
/** Cells the outline is pulled in from the page's edge. */
const inset = defineModel<number>("inset", { required: true });
const snapToGrid = defineModel<boolean>("snapToGrid", { required: true });

const emit = defineEmits<{ apply: []; "keep-all": []; "drop-all": []; cancel: [] }>();

const keepLabel = computed(() => (kept === proposed ? `Keep all ${proposed}` : `Keep ${kept}`));
</script>
