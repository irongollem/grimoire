<template>
  <div class="flex flex-col gap-3" data-testid="wash-panel">
    <AppButton v-if="!wash" variant="subtle" size="sm" label="Paint a paper wash" data-testid="wash-on" @click="emit('on')" />
    <template v-else>
      <PanelField label="Paper comes in from">
        <SegmentedControl :model-value="wash.from" :options="WASH_SIDE_OPTIONS" size="xs" wrap @update:model-value="emit('side', $event)" />
      </PanelField>
      <PanelRange label="How far it reaches" :model-value="pct(wash.reach)" :min="15" :max="90" @update:model-value="emit('field', 'reach', $event / 100)" />
      <PanelRange label="Brush (fine to broad)" :model-value="pct(wash.brush)" :min="0" :max="100" @update:model-value="emit('field', 'brush', $event / 100)" />
      <PanelRange label="Edge (wet to dry)" :model-value="pct(wash.dry)" :min="0" :max="100" @update:model-value="emit('field', 'dry', $event / 100)" />
      <div class="flex flex-wrap gap-2">
        <AppButton variant="subtle" size="sm" label="Paint it again" data-testid="wash-repaint" @click="emit('repaint')" />
        <AppButton variant="ghost" size="sm" label="Remove the wash" data-testid="wash-remove" @click="emit('remove')" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * The paper wash's controls, drawn once for the panel beside the page and the
 * Illuminator. It holds no state: the owner passes the wash step (or null when
 * off) and writes back what these events say.
 */
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import PanelField from "@/scriptorium/components/panel/PanelField.vue";
import PanelRange from "@/scriptorium/components/panel/PanelRange.vue";
import { WASH_SIDE_OPTIONS, type WashField } from "@/scriptorium/illuminator/lib/washEdits";
import type { WashSide, WashStep } from "@/scriptorium/illuminator/lib/treatment";

defineProps<{ wash: WashStep | null }>();
const emit = defineEmits<{
  on: [];
  side: [from: WashSide];
  field: [field: WashField, value: number];
  repaint: [];
  remove: [];
}>();

const pct = (v: number) => Math.round(v * 100);
</script>
