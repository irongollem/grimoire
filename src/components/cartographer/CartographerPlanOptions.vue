<template>
  <CartographerOptionsSlip :title="title">
    <!-- The Plan layer's options, in the same slip the Drawing's tool options use. The tools
         themselves are the rail's: this only says how the chosen one traces and what it is for. -->
    <template v-if="planTool === 'space' || planTool === 'zone'">
      <div class="flex items-center gap-1.5">
        <span class="text-label text-muted-foreground">Trace with</span>
        <SegmentedControl v-model="traceTool" :options="TRACE_TOOL_OPTIONS" size="xs" />
      </div>

      <AppSelect
        v-if="traceTool === 'template'"
        v-model="templateShape"
        tone="card"
        size="body-xs"
        aria-label="Shape"
      >
        <option v-for="shape in TEMPLATE_SHAPES" :key="shape" :value="shape">{{ TEMPLATE_SHAPE_LABELS[shape] }}</option>
      </AppSelect>

      <template v-if="planTool === 'zone'">
        <AppSelect v-model="zoneKind" tone="card" size="body-xs" aria-label="Kind">
          <option v-for="kind in ZONE_KINDS" :key="kind" :value="kind">{{ ZONE_KIND_LABELS[kind] }}</option>
        </AppSelect>
        <AppInput v-model="zoneLabel" aria-label="Label" placeholder="Flooded, difficult terrain…" size="body-xs" class="w-48" />
      </template>

      <AppButton variant="ghost" fill="muted" size="xs" @click="$emit('start-new')">
        New {{ planTool === "zone" ? "zone" : "space" }}
      </AppButton>
      <span class="basis-full text-caption-sm text-muted-foreground">
        Paint, pen or drop a template to extend the current shape. Click an existing unbound one on the canvas to resume it.
      </span>
    </template>

    <span v-else-if="planTool === 'door'" class="text-caption text-muted-foreground">
      Click a cell edge to place a door there. Click a placed one to cycle door ↔ arch. Alt-click removes it.
    </span>

    <span v-else-if="planTool === 'claim'" class="text-caption text-muted-foreground">
      Click a painted floor region of the Drawing to trace it straight onto the Plan as a space.
    </span>

    <span v-else-if="planTool === 'erase'" class="text-caption text-muted-foreground">
      Drag across cells to take them out of any space or zone. A room whose area you empty keeps its page in the Atlas.
    </span>
  </CartographerOptionsSlip>
</template>

<script setup lang="ts">
// The Plan layer's options (epic #884 S7b; the palette column became the tool rail and
// this slip when the editor went to a slim bar). Space and Zone trace with the same
// brush/pen/template gestures the Drawing offers (`src/lib/map/gestures/`, via
// `useRegionPointer`, see `usePlanCanvasTools.ts`), Door snaps to a cell edge, Claim reads
// a floor region straight off the Drawing. Binding a traced shape to a room, and naming it,
// stay panel actions in the Spaces drawer; this never opens or names a location.
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import CartographerOptionsSlip from "@/components/cartographer/CartographerOptionsSlip.vue";
import { TEMPLATE_SHAPE_LABELS, TEMPLATE_SHAPES } from "@/composables/locations/useRegionPen";
import { TRACE_TOOL_OPTIONS, type PlanTool } from "@/composables/cartographer/usePlanPalette";
import { ZONE_KINDS, ZONE_KIND_LABELS, type ZoneKind } from "@/types/locationMapRegion.types";
import type { TemplateShape, TraceTool } from "@/lib/locations/polygon";

defineProps<{
  /** The tool's name, with how it traces ("Space · Pen"). */
  title: string;
  planTool: PlanTool;
}>();

const traceTool = defineModel<TraceTool>("traceTool", { required: true });
const templateShape = defineModel<TemplateShape>("templateShape", { required: true });
const zoneKind = defineModel<ZoneKind>("zoneKind", { required: true });
const zoneLabel = defineModel<string>("zoneLabel", { required: true });

defineEmits<{ "start-new": [] }>();
</script>
