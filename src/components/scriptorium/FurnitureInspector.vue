<template>
  <Teleport to="body">
    <div
      v-if="item"
      ref="panelRef"
      class="fixed z-50 w-[min(20rem,92vw)] max-h-[80vh] overflow-y-auto rounded-xl border border-border bg-card shadow-2xl"
      :class="pos ? '' : 'bottom-4 left-4'"
      :style="pos ? { left: pos.left + 'px', top: pos.top + 'px' } : undefined"
    >
      <div
        class="flex items-center justify-between px-3 py-2 border-b border-border cursor-move select-none"
        style="touch-action: none"
        title="Drag to move"
        @pointerdown="onHeaderDown"
      >
        <h2 class="text-label-lg font-bold uppercase text-foreground pointer-events-none">{{ kindLabel }}</h2>
        <AppButton variant="ghost" size="icon-xs" icon-size="md" :icon="IconClose" aria-label="Close" @click="$emit('close')" @pointerdown.stop />
      </div>

      <div class="flex flex-col gap-3 p-3">
        <!-- Watercolor -->
        <template v-if="item.kind === 'watercolor'">
          <div class="fi-row">
            <span class="fi-label">Variant</span>
            <AppInput v-model.number="variantModel" type="number" :min="1" :max="WATERCOLOR_COUNT" tone="default" size="caption" :block="false" class="w-16" />
          </div>
          <div class="fi-row">
            <span class="fi-label">Tint</span>
            <ColorInput
              aria-label="Tint"
              :model-value="str('color', '#2a2018')"
              @update:model-value="(color) => patchProps({ color })"
            />
          </div>
          <div class="fi-row">
            <span class="fi-label">Opacity</span>
            <input type="range" min="5" max="100" :value="num('opacity', 80)" class="fi-range"
              @input="patchProps({ opacity: Number(($event.target as HTMLInputElement).value) })" />
            <span class="fi-val">{{ num('opacity', 80) }}</span>
          </div>
        </template>

        <!-- Watermark -->
        <template v-else-if="item.kind === 'watermark'">
          <div class="fi-row">
            <span class="fi-label">Text</span>
            <AppInput v-model="watermarkTextModel" tone="default" size="caption" :block="false" class="flex-1" />
          </div>
          <div class="fi-row">
            <span class="fi-label">Rotation</span>
            <input type="range" min="-90" max="90" :value="num('rotation', -30)" class="fi-range"
              @input="patchProps({ rotation: Number(($event.target as HTMLInputElement).value) })" />
            <span class="fi-val">{{ num('rotation', -30) }}</span>
          </div>
          <div class="fi-row">
            <span class="fi-label">Opacity</span>
            <input type="range" min="2" max="100" :value="num('opacity', 15)" class="fi-range"
              @input="patchProps({ opacity: Number(($event.target as HTMLInputElement).value) })" />
            <span class="fi-val">{{ num('opacity', 15) }}</span>
          </div>
        </template>

        <!-- Artist credit -->
        <template v-else-if="item.kind === 'artistCredit'">
          <div class="fi-row">
            <span class="fi-label">Artist</span>
            <AppInput v-model="artistNameModel" placeholder="Art by…" tone="default" size="caption" :block="false" class="flex-1" />
          </div>
          <div class="fi-row items-start">
            <span class="fi-label mt-1">Corner</span>
            <div class="grid grid-cols-2 gap-1 flex-1">
              <AppButton
                v-for="c in CORNERS" :key="c.v"
                variant="subtle" fill="muted" size="xs"
                :active="str('position', 'bottom-right') === c.v"
                class="uppercase"
                :label="c.label"
                @click="patchProps({ position: c.v })"
              />
            </div>
          </div>
        </template>

        <!-- Free art -->
        <template v-else-if="item.kind === 'art'">
          <ImageUpload :model-value="str('src') || null" bucket="asset-images" placeholder="Drop art or click to upload"
            @update:model-value="patchProps({ src: $event ?? '' })" />
          <!-- A picture behind the text is a wash, not a figure: it can be turned down so the words read. -->
          <div v-if="item.z === 'under'" class="fi-row">
            <span class="fi-label">Strength</span>
            <input type="range" min="20" max="100" :value="num('opacity', DEFAULT_UNDER_ART_OPACITY)" class="fi-range"
              @input="patchProps({ opacity: Number(($event.target as HTMLInputElement).value) })" />
            <span class="fi-val">{{ num('opacity', DEFAULT_UNDER_ART_OPACITY) }}</span>
          </div>
        </template>

        <!-- Width (watermark spans the page, so no width) + layer -->
        <div v-if="item.kind !== 'watermark'" class="fi-row">
          <span class="fi-label">Width</span>
          <input type="range" min="5" max="100" :value="item.width" class="fi-range"
            @input="patch({ width: Number(($event.target as HTMLInputElement).value) })" />
          <span class="fi-val">{{ Math.round(item.width) }}</span>
        </div>
        <!-- Pinning: a picture in a page corner hugs both paper edges and stays on that page. -->
        <template v-if="canPinToCorner(item.kind)">
          <div class="fi-row items-start">
            <span class="fi-label mt-1">Place</span>
            <SegmentedControl
              :model-value="item.corner ?? 'free'"
              :options="placeOptions()"
              size="xs" wrap block class="flex-1"
              @update:model-value="chooseCorner"
            />
          </div>
          <div class="fi-row items-start">
            <span class="fi-label mt-1">Stays</span>
            <SegmentedControl
              :model-value="item.anchor.type"
              :options="anchorOptions()"
              size="xs" wrap block class="flex-1"
              @update:model-value="chooseAnchor"
            />
          </div>
        </template>
        <div class="fi-row">
          <span class="fi-label">Layer</span>
          <div class="flex gap-1 flex-1">
            <AppButton
              variant="subtle" fill="muted" size="xs" class="flex-1"
              :active="item.z === 'under'"
              label="Behind the text"
              @click="patch({ z: 'under' })"
            />
            <AppButton
              variant="subtle" fill="muted" size="xs" class="flex-1"
              :active="item.z === 'over'"
              label="In front of the text"
              @click="patch({ z: 'over' })"
            />
          </div>
        </div>

        <p class="text-caption text-muted-foreground italic">
          Drag the decoration on the page to move it; drag its corner to resize.
        </p>

        <AppButton
          variant="destructive" size="xs" class="mt-1 uppercase"
          :icon="IconDelete" icon-size="xs"
          label="Remove decoration"
          @click="$emit('delete', item.id)"
        />
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from "vue";
import { IconClose, IconDelete } from "@/lib/icons";
import ImageUpload from "@/components/common/media/ImageUpload.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ColorInput from "@/components/common/controls/ColorInput.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { WATERCOLOR_COUNT } from "@/data/watercolorAssets";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import { DEFAULT_UNDER_ART_OPACITY, furniturePlacement } from "@/lib/scriptorium/furniture/renderFurniture";
import { FURNITURE_CORNERS, canPinToCorner, freeCoordinates } from "@/lib/scriptorium/furniture/model";
import type { FurnitureAnchor, FurnitureCorner, PageFurnitureItem } from "@/types/scriptorium.types";

const { item } = defineProps<{ item: PageFurnitureItem | null }>();

const emit = defineEmits<{
  update: [item: PageFurnitureItem];
  delete: [id: string];
  close: [];
}>();

const KIND_LABELS: Record<string, string> = {
  watercolor: "Watercolor",
  watermark: "Watermark",
  artistCredit: "Artist Credit",
  art: "Art",
};
const kindLabel = computed(() => (item ? (KIND_LABELS[item.kind] ?? "Decoration") : ""));

// Draggable panel: it floats over the preview and can land on the very
// decoration you're editing, so the header is a drag handle. Until first
// dragged, `pos` is null and the panel sits bottom-left via CSS; dragging
// switches it to explicit (clamped) viewport coordinates.
const panelRef = ref<HTMLElement | null>(null);
const pos = ref<{ left: number; top: number } | null>(null);
let start: { px: number; py: number; left: number; top: number } | null = null;

function onMove(e: PointerEvent) {
  if (!start || !panelRef.value) return;
  const w = panelRef.value.offsetWidth;
  const h = panelRef.value.offsetHeight;
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, start.left + (e.clientX - start.px)));
  const top = Math.max(8, Math.min(window.innerHeight - h - 8, start.top + (e.clientY - start.py)));
  pos.value = { left, top };
}
function onUp() {
  start = null;
  window.removeEventListener("pointermove", onMove);
}
function onHeaderDown(e: PointerEvent) {
  if (!panelRef.value) return;
  const r = panelRef.value.getBoundingClientRect();
  pos.value = { left: r.left, top: r.top }; // anchor to current spot before dragging
  start = { px: e.clientX, py: e.clientY, left: r.left, top: r.top };
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, { once: true });
  e.preventDefault();
}

onBeforeUnmount(() => window.removeEventListener("pointermove", onMove));

const CORNERS = [
  { v: "top-left", label: "Top L" },
  { v: "top-right", label: "Top R" },
  { v: "bottom-left", label: "Bot L" },
  { v: "bottom-right", label: "Bot R" },
] as const;

function num(key: string, fallback: number): number {
  const v = item?.props[key];
  return typeof v === "number" ? v : fallback;
}
function str(key: string, fallback = ""): string {
  const v = item?.props[key];
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : fallback;
}
function clampInt(s: string, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(Number(s) || min)));
}

const CORNER_LABELS: Record<FurnitureCorner, string> = {
  "top-left": "Top left",
  "top-right": "Top right",
  "bottom-left": "Bottom left",
  "bottom-right": "Bottom right",
};
const PLACE_OPTIONS = [
  { value: "free", label: "Free" },
  ...FURNITURE_CORNERS.map((c) => ({ value: c, label: CORNER_LABELS[c] })),
];

/**
 * Back to Free keeps a cornered picture where it is drawn. For a bottom corner
 * that needs its drawn height, which only a laid-out page gives, so without
 * one Free waits (disabled) rather than moving the picture to a guess.
 */
function freeHere(): { x: number; y: number } | null {
  if (!item) return null;
  const placement = furniturePlacement(item.id);
  return freeCoordinates(item, placement ? placement.heightPct : null);
}
function placeOptions() {
  const blocked = !!item?.corner && freeHere() === null;
  return PLACE_OPTIONS.map((o) => (o.value === "free" && blocked ? { ...o, disabled: true, tooltip: NO_PAGE_REASON } : o));
}
const NO_PAGE_REASON = "The page this sits on is not laid out yet.";

/** The page this item is drawn on, as an anchor; null when nothing is laid out. */
function pageAnchor(): FurnitureAnchor | null {
  if (!item) return null;
  const p = furniturePlacement(item.id);
  return p ? { type: "page", chapterId: p.chapterId, page: p.page } : null;
}

function chooseCorner(value: string | undefined) {
  if (!item || !value) return;
  const corner = FURNITURE_CORNERS.find((c) => c === value);
  if (!corner) {
    // Back to free: keep it where it is drawn, as left/top coordinates.
    const here = freeHere();
    if (!here) return;
    const free: PageFurnitureItem = { ...item, ...here };
    delete free.corner;
    emit("update", free);
    return;
  }
  // Flush into the corner, on the page it is drawn on now.
  emit("update", { ...item, corner, x: 0, y: 0, anchor: pageAnchor() ?? item.anchor });
}

function anchorOptions() {
  const p = item ? furniturePlacement(item.id) : null;
  const onPage = item?.anchor.type === "page";
  return [
    {
      value: "block",
      label: "Moves with its paragraph",
      disabled: onPage && !p?.firstBlockId,
      tooltip: onPage && !p?.firstBlockId ? "No paragraph is laid out on this page to follow." : undefined,
    },
    {
      value: "page",
      label: p ? `Stays on page ${p.page}` : "Stays on its page",
      disabled: !onPage && !p,
      tooltip: !onPage && !p ? NO_PAGE_REASON : undefined,
    },
  ];
}

function chooseAnchor(value: string | undefined) {
  if (!item || !value || value === item.anchor.type) return;
  if (value === "page") {
    const anchor = pageAnchor();
    if (anchor) emit("update", { ...item, anchor });
    return;
  }
  const p = furniturePlacement(item.id);
  if (p?.firstBlockId) emit("update", { ...item, anchor: { type: "block", blockId: p.firstBlockId } });
}

function patch(p: Partial<PageFurnitureItem>) {
  if (item) emit("update", { ...item, ...p });
}
function patchProps(p: Record<string, string | number>) {
  if (item) emit("update", { ...item, props: { ...item.props, ...p } });
}

// Writable computeds bridge AppInput's required v-model onto the props-bag
// getter/setter (`num`/`str` + `patchProps`) this panel already used.
const variantModel = computed<number | null>({
  get: () => num("variant", 1),
  set: (v) => patchProps({ variant: clampInt(String(v ?? 1), 1, WATERCOLOR_COUNT) }),
});
const watermarkTextModel = computed({
  get: () => str("text", "DRAFT"),
  set: (v: string) => patchProps({ text: v }),
});
const artistNameModel = computed({
  get: () => str("artistName"),
  set: (v: string) => patchProps({ artistName: v }),
});
</script>

<style scoped>
@reference "@/assets/main.css";
.fi-row {
  @apply flex items-center gap-2;
}
.fi-label {
  @apply text-eyebrow text-muted-foreground shrink-0 w-16;
}
.fi-range {
  @apply flex-1 accent-primary;
}
.fi-val {
  @apply text-caption-sm text-muted-foreground w-7 text-right;
}
</style>
