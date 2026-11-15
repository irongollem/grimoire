<template>
  <CartographerOptionsSlip :title="title" :caption="planTool === 'door' ? 'on any wall' : undefined">
    <!-- Zoning's options, in the same slip the Drawing's tool options use. The tools themselves are the
         rail's: this only says what kind the Zone tool makes, how it traces, and what it is for. -->
    <template v-if="planTool === 'zone' || planTool === 'assign'">
      <SegmentedControl
        v-model="zoneKind"
        :options="KIND_OPTIONS"
        wrap
        size="xs"
        aria-label="Kind of zone"
      />

      <span v-if="planTool === 'assign'" class="basis-full text-caption text-muted-foreground">
        Click inside a ring of walls, or on a painted floor. That area becomes a {{ kindWord }} shaped by its walls.
      </span>

      <div v-else class="flex flex-wrap items-center gap-1.5">
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

      <div v-if="planTool === 'zone' && traceTool === 'paint'" class="flex basis-full flex-wrap items-center gap-1.5">
        <BrushSizeControl id="zone-brush-size" v-model="brushRadius" />
        <span class="text-caption-sm text-muted-foreground">Paint the area. The shape follows your stroke, and Alt carves it away.</span>
      </div>

      <span v-if="planTool === 'zone' && traceTool === 'lasso'" class="basis-full text-caption-sm text-muted-foreground">
        Drag round the area. Let go and the outline closes and is smoothed. The squares it covers are worked out for you,
        for fog, footprints and rules.
      </span>

      <span v-if="planTool === 'zone'" class="basis-full text-caption-sm text-muted-foreground">
        Most rooms are already here, found from the walls. Draw a zone to add one, or drag over a found room to reshape it.
        A room is a place in the Atlas; any other kind only marks the floor.
      </span>
    </template>

    <CartographerDoorEnds
      v-else-if="planTool === 'door' && doorPending"
      :rooms="rooms"
      @place="(from, to) => $emit('place-door', from, to)"
      @cancel="$emit('cancel-door')"
    />

    <template v-else-if="planTool === 'door'">
      <SegmentedControl v-model="doorKind" :options="DOOR_KIND_OPTIONS" size="xs" aria-label="Kind of door" />
      <SegmentedControl v-model="doorWidth" :options="DOOR_WIDTH_OPTIONS" size="xs" aria-label="Width" />
      <span v-if="doorTip" class="basis-full text-caption text-foreground">{{ doorTip }}</span>
      <span class="basis-full text-caption text-muted-foreground">
        Point at a wall, straight, slanted or curved, and click to cut a door into it there. Where the picture has an
        opening and no wall is drawn, drag a short line across it. Click a placed door to cycle door and arch. Alt-click
        removes it.
      </span>
    </template>

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
import { computed } from "vue";
// Zoning's options (epic #884 S7b; Map Table frame 19 made Space and Zone one tool). The Zone tool traces with the
// same brush/pen/shape/lasso gestures the Drawing offers (`src/lib/map/gestures/`, via `useRegionPointer`, see
// `usePlanCanvasTools.ts`), Door cuts a door into any wall, Assign makes a room or zone of the area a click lands in.
// Binding a traced room to its place, and naming it, are actions of the Zoning list; this never opens or names a
// location.
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import CartographerDoorEnds from "@/components/cartographer/CartographerDoorEnds.vue";
import CartographerOptionsSlip from "@/components/cartographer/CartographerOptionsSlip.vue";
import { TEMPLATE_SHAPE_LABELS, TEMPLATE_SHAPES } from "@/composables/locations/useRegionPen";
import {
  TRACE_TOOL_OPTIONS,
  ZONING_KIND_LABELS,
  ZONING_KINDS,
  type PlanTool,
  type ZoningKind,
} from "@/composables/cartographer/usePlanPalette";
import BrushSizeControl from "@/components/cartographer/BrushSizeControl.vue";
import type { TemplateShape, TraceTool } from "@/lib/locations/polygon";

const { planTool } = defineProps<{
  /** The tool's name, with how it traces ("Zone · Pen"). */
  title: string;
  planTool: PlanTool;
  /** Zoning's list of zones is open in the drawer. */
  listOpen: boolean;
  /** The Door tool clicked an edge with no room in reach (#1195): the slip asks which rooms the door joins. */
  doorPending?: boolean;
  /** The site's rooms, for that question. */
  rooms?: readonly { id: string; name: string }[];
  /** The Door tool's line for what is under the pointer: which rooms it would join (frame 06). */
  doorTip?: string | null;
}>();

const traceTool = defineModel<TraceTool>("traceTool", { required: true });
const brushRadius = defineModel<number>("brushRadius", { required: true });
const templateShape = defineModel<TemplateShape>("templateShape", { required: true });
const zoneKind = defineModel<ZoningKind>("zoneKind", { required: true });
const zoneLabel = defineModel<string>("zoneLabel", { required: true });
const doorKind = defineModel<"door" | "arch">("doorKind", { default: "door" });
const doorWidth = defineModel<1 | 2>("doorWidth", { default: 1 });

defineEmits<{
  "start-new": [];
  "toggle-list": [];
  "place-door": [fromLocationId: string, toLocationId: string | null];
  "cancel-door": [];
}>();

const kindWord = computed(() => ZONING_KIND_LABELS[zoneKind.value].toLowerCase());
const DOOR_KIND_OPTIONS: SegmentedOption<"door" | "arch">[] = [
  { value: "door", label: "Door" },
  { value: "arch", label: "Arch" },
];
// Width in cells; a cell is 5 ft.
const DOOR_WIDTH_OPTIONS: SegmentedOption<1 | 2>[] = [
  { value: 1, label: "5 ft" },
  { value: 2, label: "10 ft" },
];
const KIND_OPTIONS: SegmentedOption<ZoningKind>[] = ZONING_KINDS.map((kind) => ({ value: kind, label: ZONING_KIND_LABELS[kind] }));
</script>
