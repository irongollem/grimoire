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
        <button type="button" class="text-muted-foreground hover:text-foreground transition-colors" title="Close" @click="$emit('close')" @pointerdown.stop>
          <IconClose class="h-4 w-4" />
        </button>
      </div>

      <div class="flex flex-col gap-3 p-3">
        <!-- Watercolor -->
        <template v-if="item.kind === 'watercolor'">
          <div class="fi-row">
            <span class="fi-label">Variant</span>
            <input type="number" min="1" :max="WATERCOLOR_COUNT" :value="num('variant', 1)" class="sc-inp w-16"
              @input="patchProps({ variant: clampInt(($event.target as HTMLInputElement).value, 1, WATERCOLOR_COUNT) })" />
          </div>
          <div class="fi-row">
            <span class="fi-label">Tint</span>
            <input type="color" :value="str('color', '#2a2018')" class="h-7 w-12 rounded border border-border bg-transparent"
              @input="patchProps({ color: ($event.target as HTMLInputElement).value })" />
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
            <input type="text" :value="str('text', 'DRAFT')" class="sc-inp flex-1"
              @input="patchProps({ text: ($event.target as HTMLInputElement).value })" />
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
            <input type="text" :value="str('artistName')" placeholder="Art by…" class="sc-inp flex-1"
              @input="patchProps({ artistName: ($event.target as HTMLInputElement).value })" />
          </div>
          <div class="fi-row items-start">
            <span class="fi-label mt-1">Corner</span>
            <div class="grid grid-cols-2 gap-1 flex-1">
              <button v-for="c in CORNERS" :key="c.v" type="button"
                class="px-1.5 py-1 rounded border text-eyebrow transition-colors"
                :class="str('position', 'bottom-right') === c.v ? 'border-primary/50 text-primary bg-primary/10' : 'border-border text-muted-foreground hover:bg-muted'"
                @click="patchProps({ position: c.v })">{{ c.label }}</button>
            </div>
          </div>
        </template>

        <!-- Free art -->
        <template v-else-if="item.kind === 'art'">
          <ImageUpload :model-value="str('src') || null" bucket="asset-images" placeholder="Drop art or click to upload"
            @update:model-value="patchProps({ src: $event ?? '' })" />
        </template>

        <!-- Width (watermark spans the page, so no width) + layer -->
        <div v-if="item.kind !== 'watermark'" class="fi-row">
          <span class="fi-label">Width</span>
          <input type="range" min="5" max="100" :value="item.width" class="fi-range"
            @input="patch({ width: Number(($event.target as HTMLInputElement).value) })" />
          <span class="fi-val">{{ Math.round(item.width) }}</span>
        </div>
        <div class="fi-row">
          <span class="fi-label">Layer</span>
          <div class="flex gap-1 flex-1">
            <button type="button" class="flex-1 px-2 py-1 rounded border text-eyebrow transition-colors"
              :class="item.z === 'under' ? 'border-primary/50 text-primary bg-primary/10' : 'border-border text-muted-foreground hover:bg-muted'"
              @click="patch({ z: 'under' })">Behind</button>
            <button type="button" class="flex-1 px-2 py-1 rounded border text-eyebrow transition-colors"
              :class="item.z === 'over' ? 'border-primary/50 text-primary bg-primary/10' : 'border-border text-muted-foreground hover:bg-muted'"
              @click="patch({ z: 'over' })">Above</button>
          </div>
        </div>

        <p class="text-caption text-muted-foreground italic">
          Drag the decoration on the page to move it; drag its corner to resize.
        </p>

        <button type="button"
          class="mt-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded border border-destructive/40 text-eyebrow font-semibold text-destructive hover:bg-destructive/10 transition-colors"
          @click="$emit('delete', item.id)">
          <IconDelete class="h-3 w-3" /> Remove decoration
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from "vue";
import { IconClose, IconDelete } from "@/lib/icons";
import ImageUpload from "@/components/common/ImageUpload.vue";
import { WATERCOLOR_COUNT } from "@/data/watercolorAssets";
import type { PageFurnitureItem } from "@/types/scriptorium.types";

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

function patch(p: Partial<PageFurnitureItem>) {
  if (item) emit("update", { ...item, ...p });
}
function patchProps(p: Record<string, string | number>) {
  if (item) emit("update", { ...item, props: { ...item.props, ...p } });
}
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
.sc-inp {
  @apply rounded border border-border bg-background px-1.5 py-1 text-caption text-foreground;
}
</style>
