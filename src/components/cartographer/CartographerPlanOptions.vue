<template>
  <CartographerOptionsSlip :title="title">
    <!-- Zoning's options, in the same slip the Drawing's tool options use. The tools themselves are the
         rail's: this only says what kind the Zone tool makes, how it traces, and what it is for. -->
    <template v-if="planTool === 'zone'">
      <SegmentedControl
        v-model="zoneKind"
        :options="KIND_OPTIONS"
        wrap
        size="xs"
        aria-label="Kind of zone"
      />

      <div class="flex flex-wrap items-center gap-1.5">
        <span class="text-label text-muted-foreground">Trace with</span>
        <SegmentedControl v-model="traceTool" :options="TRACE_TOOL_OPTIONS" size="xs" />
        <AppSelect
          v-if="traceTool === 'template'"
          v-model="templateShape"
          tone="card"
          size="body-xs"
          aria-label="Shape"
        >
          <option v-for="shape in TEMPLATE_SHAPES" :key="shape" :value="shape">{{ TEMPLATE_SHAPE_LABELS[shape] }}</option>
        </AppSelect>
        <AppInput v-model="zoneLabel" aria-label="Name" placeholder="Name it (optional)" size="body-xs" class="w-40" />
        <AppButton variant="ghost" fill="muted" size="xs" @click="$emit('start-new')">New zone</AppButton>
      </div>

      <span class="basis-full text-caption-sm text-muted-foreground">
        Most rooms are already here, found from the walls. Draw a zone to add one, or drag over a found room to reshape it.
        A room is a place in the Atlas; any other kind only marks the floor.
      </span>
    </template>

    <span v-else-if="planTool === 'door'" class="text-caption text-muted-foreground">
      Click a cell edge to place a door there. Click a placed one to cycle door and arch. Alt-click removes it.
    </span>

    <span v-else-if="planTool === 'fill'" class="text-caption text-muted-foreground">
      Click a painted floor region of the Drawing to pour a zone of the chosen kind up to its walls.
    </span>

    <span v-else-if="planTool === 'erase'" class="text-caption text-muted-foreground">
      Drag across cells to take them out of any zone. A room whose area you empty keeps its page in the Atlas.
    </span>

    <AppButton
      variant="ghost"
      fill="muted"
      size="xs"
      class="ml-auto"
      :active="listOpen"
      :label="listOpen ? 'Hide zones list' : 'Show zones list'"
      @click="$emit('toggle-list')"
    />
  </CartographerOptionsSlip>
</template>

<script setup lang="ts">
// Zoning's options (epic #884 S7b; Map Table frame 19 made Space and Zone one tool). The Zone tool traces with the
// same brush/pen/shape gestures the Drawing offers (`src/lib/map/gestures/`, via `useRegionPointer`, see
// `usePlanCanvasTools.ts`), Door snaps to a cell edge, Fill pours a zone over a floored region of the Drawing.
// Binding a traced room to its place, and naming it, are actions of the Zoning list; this never opens or names a
// location.
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import CartographerOptionsSlip from "@/components/cartographer/CartographerOptionsSlip.vue";
import { TEMPLATE_SHAPE_LABELS, TEMPLATE_SHAPES } from "@/composables/locations/useRegionPen";
import {
  TRACE_TOOL_OPTIONS,
  ZONING_KIND_LABELS,
  ZONING_KINDS,
  type PlanTool,
  type ZoningKind,
} from "@/composables/cartographer/usePlanPalette";
import type { TemplateShape, TraceTool } from "@/lib/locations/polygon";

defineProps<{
  /** The tool's name, with how it traces ("Zone · Pen"). */
  title: string;
  planTool: PlanTool;
  /** Zoning's list of zones is open in the drawer. */
  listOpen: boolean;
}>();

const traceTool = defineModel<TraceTool>("traceTool", { required: true });
const templateShape = defineModel<TemplateShape>("templateShape", { required: true });
const zoneKind = defineModel<ZoningKind>("zoneKind", { required: true });
const zoneLabel = defineModel<string>("zoneLabel", { required: true });

defineEmits<{ "start-new": []; "toggle-list": [] }>();

const KIND_OPTIONS: SegmentedOption<ZoningKind>[] = ZONING_KINDS.map((kind) => ({ value: kind, label: ZONING_KIND_LABELS[kind] }));
</script>
