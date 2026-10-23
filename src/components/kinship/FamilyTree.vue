<template>
  <FamilyTreePhone
    v-if="isMobile"
    :layout="layout"
    :people="source.people.value"
    :focus="focus"
    :married-in="marriedIn"
    :succession="succession"
    :dimmed="dimmed"
    @select="emit('select', $event)"
    @unfold="emit('unfold', $event)"
  />
  <div
    v-else
    ref="canvas"
    role="group"
    aria-label="Family tree"
    class="relative h-full min-h-[28rem] touch-none select-none overflow-hidden"
    :class="[viewport.dragging.value ? 'cursor-grabbing' : 'cursor-grab', hand.spaceHeld.value && (viewport.dragging.value ? '[&_*]:!cursor-grabbing' : '[&_*]:!cursor-grab')]"
    @pointerenter="hovered = true"
    @pointerleave="hovered = false"
    @click.capture="viewport.onClickCapture"
    @pointerdown="viewport.onPointerDown"
    @pointermove="viewport.onPointerMove"
    @pointerup="viewport.onPointerUp"
    @pointercancel="viewport.onPointerUp"
    @wheel="viewport.onWheel"
  >
    <div class="absolute left-0 top-0" :style="[viewport.stageStyle.value, { width: `${stageW}rem`, height: `${stageH}rem` }]">
      <FamilyTreeLines :layout="layout" :width="stageW" :height="stageH" />
      <span
        v-for="label in axisLabels"
        :key="label.row"
        class="absolute left-0 text-label uppercase text-muted-foreground"
        :style="{ top: `${rowTop(label.row) + 0.75}rem` }"
      >born c. {{ label.year }}</span>
      <template v-for="slot in slots" :key="slot.card.id">
        <AppButton
          v-if="slot.card.foldOf !== null"
          variant="subtle"
          size="sm"
          class="absolute justify-center border-dashed"
          :style="boxStyle(slot.card)"
          :label="countLabel(slot.card.foldCount)"
          @click="emit('unfold', slot.card.foldOf)"
        />
        <!-- The card's torn edge sets its own position, so the box that places it is a wrapper. -->
        <div v-else-if="slot.view" class="absolute flex" :style="boxStyle(slot.card)">
          <KinCard
            class="w-full"
            :person="slot.view"
            :focus="slot.view.key === focus"
            :married-in="marriedIn?.has(slot.view.key)"
            :rank="succession?.get(slot.view.key) ?? null"
            :dimmed="dimmed?.has(slot.view.key)"
            @click="emit('select', slot.view.key)"
          />
        </div>
      </template>
    </div>
    <div class="absolute right-2 top-2 flex gap-1" data-slip>
      <AppButton variant="subtle" size="icon-sm" :icon="IconZoomIn" aria-label="Zoom in" @click="zoom(1.2)" />
      <AppButton variant="subtle" size="icon-sm" :icon="IconZoomOut" aria-label="Zoom out" @click="zoom(1 / 1.2)" />
      <AppButton variant="subtle" size="sm" :icon="IconMaximize" label="Fit" @click="fit" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The tree (frame 04). layoutTree places cards in card units with a gap between
 * neighbours; here a unit is one card width, so no two cards can overlap. Cards
 * are real buttons in reading order, the lines are one SVG beneath them.
 */
import { computed, nextTick, onMounted, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import KinCard from "@/components/kinship/KinCard.vue";
import { useIsMobile } from "@/composables/useBreakpoint";
import { useCanvasHand } from "@/composables/useCanvasHand";
import type { ZoomTarget } from "@/lib/canvasControls/zoomKeys";
import { useTreeViewport } from "@/composables/kinship/useTreeViewport";
import type { KinGraphSource } from "@/composables/kinship/useKinGraph";
import { layoutTree, type PlacedCard } from "@/lib/kinship/layout";
import { IconMaximize, IconZoomIn, IconZoomOut } from "@/lib/icons";
import type { PersonKey } from "@/types/kinship.types";
import FamilyTreeLines from "./FamilyTreeLines.vue";
import FamilyTreePhone from "./FamilyTreePhone.vue";
import {
  AXIS_REM,
  CARD_H_REM,
  CARD_REM,
  FOLD_H_REM,
  ROW_PITCH_REM,
  TOP_REM,
  cardLeftOf,
  cardTop,
  cardWidth,
  inReadingOrder,
  isFold,
  rowTop,
} from "./treeGeometry";

const { source, members, folds, anchor, focus = null, marriedIn, succession, dimmed } = defineProps<{
  source: KinGraphSource;
  members: Set<PersonKey>;
  folds: Map<PersonKey, PersonKey[]>;
  anchor?: PersonKey;
  focus?: PersonKey | null;
  marriedIn?: Set<PersonKey>;
  succession?: Map<PersonKey, number>;
  dimmed?: Set<PersonKey>;
}>();
const emit = defineEmits<{ select: [key: PersonKey]; unfold: [parent: PersonKey] }>();

const isMobile = useIsMobile();
const canvas = ref<HTMLElement | null>(null);

// A page can hold more than one tree (a lineage per house), and each would answer
// Space and the zoom keys on the window. Only the tree under the pointer does.
const hovered = ref(false);
const hand = useCanvasHand({ onZoom: zoomTo, active: () => hovered.value });
const viewport = useTreeViewport({ forcePan: (ev) => hand.isForcedPan(ev) });

const layout = computed(() => layoutTree({ graph: source.graph.value, members, folds, anchor }));
const ordered = computed(() => inReadingOrder(layout.value.cards));
const stageW = computed(() => AXIS_REM + layout.value.width * CARD_REM + 1);
const stageH = computed(() => TOP_REM + layout.value.rows * ROW_PITCH_REM);

const slots = computed(() =>
  ordered.value.map((card) => ({
    card,
    view: card.person !== null ? (source.people.value.get(card.person) ?? null) : null,
  })),
);
const axisLabels = computed(() =>
  layout.value.rowBornYear.flatMap((year, row) => (year === null ? [] : [{ row, year }])),
);
const countLabel = (n: number): string => (n === 1 ? "1 child" : `${n} children`);

function boxStyle(c: PlacedCard): Record<string, string> {
  return {
    left: `${cardLeftOf(c)}rem`,
    top: `${cardTop(c)}rem`,
    width: `${cardWidth(c)}rem`,
    height: `${isFold(c) ? FOLD_H_REM : CARD_H_REM}rem`,
  };
}

const remPx = (): number => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

function fit(): void {
  const el = canvas.value;
  if (!el) return;
  const rem = remPx();
  viewport.fit(el.clientWidth, el.clientHeight, stageW.value * rem, stageH.value * rem);
}

function zoom(factor: number): void {
  const el = canvas.value;
  viewport.zoomBy(factor, (el?.clientWidth ?? 0) / 2, (el?.clientHeight ?? 0) / 2);
}

function zoomTo(to: ZoomTarget): void {
  if (to === "in") zoom(1.2);
  else if (to === "out") zoom(1 / 1.2);
  else if (to === "fit") fit();
  else {
    const el = canvas.value;
    viewport.zoomBy(1 / viewport.scale.value, (el?.clientWidth ?? 0) / 2, (el?.clientHeight ?? 0) / 2);
  }
}

// Fit when the tree first draws and when it is re-centred; an unfold keeps the viewer's view.
onMounted(() => nextTick(fit));
watch(
  () => anchor,
  () => nextTick(fit),
);
</script>
