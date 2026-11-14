<template>
  <CartographerOptionsSlip :title="title">
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

    <span v-else-if="planTool === 'door'" class="text-caption text-muted-foreground">
      Click a cell edge to place a door there. It joins the rooms within a cell of either side. Click a placed one to
      cycle door and arch. Alt-click removes it.
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
import { computed } from "vue";
// Zoning's options (epic #884 S7b; Map Table frame 19 made Space and Zone one tool). The Zone tool traces with the
// same brush/pen/shape gestures the Drawing offers (`src/lib/map/gestures/`, via `useRegionPointer`, see
// `usePlanCanvasTools.ts`), Door snaps to a cell edge, Assign makes a room or zone of the area a click lands in.
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
}>();

const traceTool = defineModel<TraceTool>("traceTool", { required: true });
const templateShape = defineModel<TemplateShape>("templateShape", { required: true });
const zoneKind = defineModel<ZoningKind>("zoneKind", { required: true });
const zoneLabel = defineModel<string>("zoneLabel", { required: true });

defineEmits<{
  "start-new": [];
  "toggle-list": [];
  "place-door": [fromLocationId: string, toLocationId: string | null];
  "cancel-door": [];
}>();

const kindWord = computed(() => ZONING_KIND_LABELS[zoneKind.value].toLowerCase());
const KIND_OPTIONS: SegmentedOption<ZoningKind>[] = ZONING_KINDS.map((kind) => ({ value: kind, label: ZONING_KIND_LABELS[kind] }));
</script>
