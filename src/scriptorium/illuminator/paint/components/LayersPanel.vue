<template>
  <section class="flex flex-col gap-3 p-4" aria-label="Layers">
    <ul class="flex flex-col gap-1" role="listbox" aria-label="Layers, top first">
      <li
        v-for="(layer, di) in rows"
        :key="layer.id"
        role="option"
        :aria-selected="layer.id === activeId"
        tabindex="0"
        class="flex items-center gap-2 rounded-md border px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-primary"
        :class="[
          layer.id === activeId ? 'border-primary/60 bg-primary/10' : 'border-border bg-muted/40 hover:bg-muted',
          overIndex === di && dragId !== layer.id ? 'ring-2 ring-primary/60' : '',
        ]"
        :data-testid="`layer-${layer.id}`"
        @click="emit('select', layer.id)"
        @keydown="onRowKey(layer, $event)"
        @pointerdown="onRowDown(layer, di, $event)"
        @pointerenter="onRowEnter(di)"
      >
        <AppButton
          variant="ghost"
          size="icon-xs"
          :icon="layer.visible ? IconReveal : IconHide"
          :ariaLabel="layer.visible ? `Hide ${displayName(layer)}` : `Show ${displayName(layer)}`"
          @click.stop="emit('set-visible', layer.id, !layer.visible)"
          @pointerdown.stop
        />
        <span class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border bg-muted">
          <slot name="thumbnail" :layer="layer">
            <LayerThumbnail :thumbnail="thumbnail" :layer-id="layer.id" :revision="revision" />
          </slot>
        </span>
        <div class="min-w-0 flex-1">
          <AppInput
            v-if="renamingId === layer.id"
            v-model="renameDraft"
            size="xs"
            aria-label="Layer name"
            data-testid="rename-input"
            @click.stop
            @pointerdown.stop
            @keydown.enter.stop.prevent="commitRename(layer)"
            @keydown.escape.stop.prevent="renamingId = null"
            @blur="commitRename(layer)"
          />
          <span
            v-else
            class="block truncate text-body"
            :class="layer.visible ? 'text-foreground' : 'text-muted-foreground'"
            @dblclick.stop="startRename(layer)"
          >{{ displayName(layer) }}</span>
        </div>
        <span v-if="layer.kind === 'paint'" class="shrink-0 text-caption text-muted-foreground tabular-nums">
          {{ blendLabel(layer.blend) }} {{ Math.round(layer.opacity * 100) }}%
        </span>
        <IconLock v-if="layer.kind === 'paint' && layer.lockAlpha" class="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Transparency locked" />
      </li>
    </ul>

    <div v-if="active" class="flex flex-col gap-2.5" data-testid="layer-props">
      <label class="flex items-center gap-2">
        <span class="text-eyebrow text-muted-foreground">Blend</span>
        <AppSelect
          size="xs"
          block
          aria-label="Layer blend mode"
          :model-value="active.blend"
          @update:model-value="emit('set-props', active.id, { blend: $event as LayerBlend })"
        >
          <option v-for="b in LAYER_BLENDS" :key="b.value" :value="b.value">{{ b.label }}</option>
        </AppSelect>
      </label>
      <PaintSlider
        label="Opacity"
        layout="stacked"
        :model-value="active.opacity"
        :display="`${Math.round(active.opacity * 100)}%`"
        @update:model-value="emit('set-props', active.id, { opacity: $event })"
        @commit="emit('commit-opacity', active.id)"
      />
      <AppCheckbox
        label="Lock transparency"
        :model-value="active.lockAlpha"
        @update:model-value="emit('set-props', active.id, { lockAlpha: $event })"
      />
    </div>

    <div class="flex flex-wrap gap-1.5">
      <AppButton variant="subtle" size="xs" :icon="IconAdd" label="New layer" @click="emit('add')" />
      <AppButton
        variant="subtle"
        size="xs"
        :icon="IconMergeDown"
        label="Merge down"
        :disabled="!canMergeDown"
        @click="emit('merge-down', activeId)"
      />
      <AppButton
        variant="subtle"
        size="xs"
        :icon="IconDelete"
        label="Delete"
        :disabled="!canDelete"
        @click="emit('delete', activeId)"
      />
    </div>

    <div v-if="canFlatten" class="flex flex-col gap-1 border-t border-border pt-3">
      <AppButton variant="subtle" size="xs" :icon="IconMergeDown" label="Flatten into the picture" data-testid="flatten" @click="emit('flatten')" />
      <p class="text-caption text-muted-foreground">Makes the painting part of the picture and frees its painting slot.</p>
    </div>

    <p class="text-caption text-muted-foreground">
      The brush's mode decides how a stroke mixes with its layer; the layer's mode decides how the layer mixes with the ones below.
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { IconAdd, IconDelete, IconHide, IconLock, IconMergeDown, IconReveal } from "@/lib/icons";
import PaintSlider from "./PaintSlider.vue";
import LayerThumbnail, { type ThumbnailFn } from "./LayerThumbnail.vue";
import type { Layer, LayerBlend, PaintLayer } from "../session/types";
import { dropIndex, displayName, displayOrder, keyboardMoveIndex } from "./layersOrder";
import { LAYER_BLENDS } from "./optionsFields";

/**
 * The layers panel (frame 09). `layers` is the session's list, bottom first; rows are drawn top first, and every
 * `move` goes back out in the session's bottom-first index space.
 */
const { layers, activeId, canDelete = false, canMergeDown = false, canFlatten = false, thumbnail = null, revision = 0 } = defineProps<{
  layers: readonly Layer[];
  activeId: string;
  /** What the session allows for the active layer: it owns the rule, the panel only shows it. */
  canDelete?: boolean;
  canMergeDown?: boolean;
  /** Whether there is a painting to flatten into the picture. */
  canFlatten?: boolean;
  /** Pixels of a layer scaled to thumbnail size, or null while it has none. */
  thumbnail?: ThumbnailFn | null;
  /** Bump when pixels change so the thumbnails redraw. */
  revision?: number;
}>();

const emit = defineEmits<{
  (e: "select", id: string): void;
  (e: "set-visible", id: string, visible: boolean): void;
  (e: "set-props", id: string, props: Partial<Pick<PaintLayer, "name" | "blend" | "opacity" | "lockAlpha">>): void;
  /** The opacity thumb was released: the caller records one history entry for the whole drag. */
  (e: "commit-opacity", id: string): void;
  (e: "add"): void;
  (e: "delete", id: string): void;
  (e: "merge-down", id: string): void;
  (e: "move", id: string, toIndex: number): void;
  (e: "flatten"): void;
}>();

const rows = computed(() => displayOrder(layers));
const active = computed(() => {
  const l = layers.find((x) => x.id === activeId);
  return l && l.kind === "paint" ? l : null;
});
const blendLabel = (b: LayerBlend) => LAYER_BLENDS.find((x) => x.value === b)?.label ?? b;

const renamingId = ref<string | null>(null);
const renameDraft = ref("");
function startRename(layer: Layer) {
  if (layer.kind !== "paint") return;
  renamingId.value = layer.id;
  renameDraft.value = layer.name;
}
function commitRename(layer: Layer) {
  if (renamingId.value !== layer.id) return; // Escape already closed it; the blur that follows must not commit.
  renamingId.value = null;
  const name = renameDraft.value.trim();
  if (name !== "" && layer.kind === "paint" && name !== layer.name) emit("set-props", layer.id, { name });
}

function onRowKey(layer: Layer, ev: KeyboardEvent) {
  if (ev.target !== ev.currentTarget) return;
  if (ev.altKey && (ev.key === "ArrowUp" || ev.key === "ArrowDown")) {
    ev.preventDefault();
    const to = keyboardMoveIndex(layers, layer.id, ev.key === "ArrowUp" ? "up" : "down");
    if (to !== null) emit("move", layer.id, to);
  } else if (ev.key === "Enter" || ev.key === " ") {
    ev.preventDefault();
    emit("select", layer.id);
  } else if (ev.key === "F2") {
    startRename(layer);
  }
}

// Drag to reorder: press a row, move over another, release to drop there.
const dragId = ref<string | null>(null);
const overIndex = ref<number | null>(null);
function onRowDown(layer: Layer, di: number, ev: PointerEvent) {
  if (ev.button !== 0 || layer.kind !== "paint" || layers.length < 2 || renamingId.value) return;
  dragId.value = layer.id;
  overIndex.value = di;
  const end = () => {
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", cancel);
    const id = dragId.value;
    const over = overIndex.value;
    dragId.value = null;
    overIndex.value = null;
    if (id === null || over === null) return;
    const from = layers.findIndex((l) => l.id === id);
    const to = dropIndex(over, layers.length);
    // The picture stays the bottom of the stack; a drop onto it is a drop just above it.
    const target = Math.max(to, layers.findIndex((l) => l.kind === "picture") + 1);
    if (from >= 0 && target !== from) emit("move", id, target);
  };
  const cancel = () => {
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", cancel);
    dragId.value = null;
    overIndex.value = null;
  };
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", cancel);
}
function onRowEnter(di: number) {
  if (dragId.value !== null) overIndex.value = di;
}
</script>
