<template>
  <aside class="flex lg:flex-col flex-row gap-1 lg:w-44 shrink-0 bg-card border border-border rounded-lg p-2">
    <h4 class="hidden lg:flex items-center gap-1.5 text-eyebrow text-muted-foreground px-1 pb-1">Plan</h4>

    <AppButton
      v-for="t in PLAN_TOOLS"
      :key="t.id"
      variant="menu"
      size="caption"
      block
      class="gap-2 py-1.5"
      :active="planTool === t.id"
      :tooltip="t.label"
      @click="planTool = t.id"
    >
      <template #icon>
        <component :is="PLAN_TOOL_ICONS[t.id]" class="h-4 w-4 shrink-0" />
      </template>
      <span class="hidden lg:inline flex-1">{{ t.label }}</span>
    </AppButton>

    <div v-if="planTool === 'space' || planTool === 'zone'" class="hidden lg:block mt-2 border-t border-border pt-2">
      <label class="block text-eyebrow text-muted-foreground mb-1">Trace with</label>
      <SegmentedControl v-model="traceTool" :options="TRACE_TOOL_OPTIONS" size="xs" block class="mb-2" />

      <template v-if="traceTool === 'template'">
        <label class="block text-eyebrow text-muted-foreground mb-1">Shape</label>
        <AppSelect v-model="templateShape" tone="card" size="body-xs" class="mb-2" block>
          <option v-for="shape in TEMPLATE_SHAPES" :key="shape" :value="shape">{{ TEMPLATE_SHAPE_LABELS[shape] }}</option>
        </AppSelect>
      </template>

      <template v-if="planTool === 'zone'">
        <label class="block text-eyebrow text-muted-foreground mb-1">Kind</label>
        <AppSelect v-model="zoneKind" tone="card" size="body-xs" class="mb-2" block>
          <option v-for="kind in ZONE_KINDS" :key="kind" :value="kind">{{ ZONE_KIND_LABELS[kind] }}</option>
        </AppSelect>
        <label class="block text-eyebrow text-muted-foreground mb-1">Label</label>
        <AppInput v-model="zoneLabel" placeholder="Flooded, difficult terrain…" size="body-xs" class="mb-2" block />
      </template>

      <AppButton variant="ghost" fill="muted" size="caption" block @click="$emit('start-new')">
        New {{ planTool === "zone" ? "zone" : "space" }}
      </AppButton>
      <p class="text-caption-sm text-muted-foreground mt-2">
        Paint, pen or drop a template to extend the current shape — click an existing unbound one on the canvas to resume it.
      </p>
    </div>

    <p v-if="planTool === 'door'" class="hidden lg:block mt-2 border-t border-border pt-2 text-caption-sm text-muted-foreground">
      Click a cell edge to place a door there. Click a placed one to cycle door ↔ arch. Alt-click removes it.
    </p>

    <p v-if="planTool === 'claim'" class="hidden lg:block mt-2 border-t border-border pt-2 text-caption-sm text-muted-foreground">
      Click a painted floor region of the Drawing to trace it straight onto the Plan as a space.
    </p>
  </aside>
</template>

<script setup lang="ts">
// The Plan layer's own tool palette (epic #884 S7b), a sibling of
// `CartographerToolPalette.vue` shown in its place once `MapWorkbench`'s
// layer selector is on Plan. Four tools, not the Drawing's dozen: Space and
// Zone trace with the same brush/pen/template gestures the Drawing offers
// (`src/lib/map/gestures/`, via `useRegionPointer` — see
// `usePlanCanvasTools.ts`), Door snaps to a cell edge, Claim reads a floor
// region straight off the Drawing. Binding a traced shape to a room, and
// naming it, stay panel actions elsewhere (the next story's Atlas mount) —
// this palette only ever decides which gesture means what; it never opens or
// names a location.
import { IconDoor, IconFill, IconHighlight, IconSplitCell } from "@/lib/icons";
import type { AppIcon } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import { TEMPLATE_SHAPE_LABELS, TEMPLATE_SHAPES } from "@/composables/locations/useRegionPen";
import { PLAN_TOOLS, type PlanTool } from "@/composables/cartographer/usePlanPalette";
import { ZONE_KINDS, ZONE_KIND_LABELS, type ZoneKind } from "@/types/locationMapRegion.types";
import type { TemplateShape, TraceTool } from "@/lib/locations/polygon";

const PLAN_TOOL_ICONS: Record<PlanTool, AppIcon> = {
  space: IconSplitCell,
  zone: IconHighlight,
  door: IconDoor,
  claim: IconFill,
};

const TRACE_TOOL_OPTIONS: { value: TraceTool; label: string }[] = [
  { value: "paint", label: "Brush" },
  { value: "pen", label: "Pen" },
  { value: "template", label: "Shape" },
];

const planTool = defineModel<PlanTool>("planTool", { required: true });
const traceTool = defineModel<TraceTool>("traceTool", { required: true });
const templateShape = defineModel<TemplateShape>("templateShape", { required: true });
const zoneKind = defineModel<ZoneKind>("zoneKind", { required: true });
const zoneLabel = defineModel<string>("zoneLabel", { required: true });

defineEmits<{ "start-new": [] }>();
</script>
