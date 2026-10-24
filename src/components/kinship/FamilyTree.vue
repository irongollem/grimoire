<template>
  <div
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
      <FamilyTreeLines :layout="layout" :width="stageW" :height="stageH" :geometry="geometry" />
      <span
        v-for="label in axisLabels"
        :key="label.row"
        class="absolute left-0 text-label uppercase text-muted-foreground"
        :class="isMobile ? 'leading-tight' : ''"
        :style="{ top: `${rowTop(label.row) + (isMobile ? 0.5 : 0.75)}rem` }"
      >born c.<br v-if="isMobile" /><template v-else>{{ " " }}</template>{{ label.year }}</span>
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
            :compact="isMobile"
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
 * The tree (frame 04), at every width. layoutTree places cards in card units with
 * a gap between neighbours; here a unit is one card width, so no two cards can
 * overlap. Cards are real buttons in reading order, the lines are one SVG beneath
 * them. The phone draws the same tree: smaller cards and axis, compact cards, and
 * a first view that never shrinks below 0.8 (a wide family centres on the focus
 * person instead). The old per-generation strips had no lines and did not read as
 * a tree (maintainer, 24 Oct 2026), so they are gone.
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
import { DESKTOP_GEOMETRY, PHONE_GEOMETRY, geometryHelpers, inReadingOrder } from "./treeGeometry";

/** The smallest first view on a phone; below it the tree is cropped, not shrunk. */
const PHONE_MIN_SCALE = 0.8;

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

const geometry = computed(() => (isMobile.value ? PHONE_GEOMETRY : DESKTOP_GEOMETRY));
const help = computed(() => geometryHelpers(geometry.value));
const rowTop = (row: number): number => help.value.rowTop(row);

const layout = computed(() => layoutTree({ graph: source.graph.value, members, folds, anchor }));
const ordered = computed(() => inReadingOrder(layout.value.cards));
const stageW = computed(() => geometry.value.axis + layout.value.width * geometry.value.card + 1);
const stageH = computed(() => geometry.value.top + layout.value.rows * geometry.value.rowPitch);

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
  const h = help.value;
  return {
    left: `${h.cardLeftOf(c)}rem`,
    top: `${h.cardTop(c)}rem`,
    width: `${h.cardWidth(c)}rem`,
    height: `${h.cardHeight(c)}rem`,
  };
}

const remPx = (): number => parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;

function fit(): void {
  const el = canvas.value;
  if (!el) return;
  const rem = remPx();
  viewport.fit(el.clientWidth, el.clientHeight, stageW.value * rem, stageH.value * rem);
}

/** The first view: fit on desktop; on a phone fit only if that stays readable, else centre on the focus person. */
function initialView(): void {
  const el = canvas.value;
  if (!el) return;
  if (!isMobile.value) return fit();
  const rem = remPx();
  const [w, h] = [el.clientWidth, el.clientHeight];
  const cw = stageW.value * rem;
  const ch = stageH.value * rem;
  if (w <= 0 || h <= 0) return;
  if (Math.min(1, w / cw, h / ch) >= PHONE_MIN_SCALE) return fit();
  const key = focus ?? anchor ?? null;
  const card = key === null ? undefined : layout.value.cards.find((c) => c.person === key);
  const hp = help.value;
  const px = card ? (hp.cardLeftOf(card) + hp.cardWidth(card) / 2) * rem : cw / 2;
  const py = card ? (hp.cardTop(card) + hp.cardHeight(card) / 2) * rem : ch / 2;
  viewport.centreOn(px, py, w, h, PHONE_MIN_SCALE);
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

// Draw the first view when the tree mounts, when it is re-centred or the width class flips; an unfold keeps the viewer's view.
onMounted(() => nextTick(initialView));
watch(
  () => [anchor, isMobile.value],
  () => nextTick(initialView),
);
</script>
