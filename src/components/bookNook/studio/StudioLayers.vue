<template>
  <nav class="flex flex-col gap-4 p-3" aria-label="Layers">
    <section aria-labelledby="studio-layers-picture" class="flex flex-col gap-1.5">
      <h2 id="studio-layers-picture" class="text-label uppercase text-muted-foreground">The picture</h2>
      <StudioLayerRow
        v-if="plate"
        :name="layerName(plate.id, plate.name)"
        word="Room"
        :thumb="plate.src"
        :icon="IconImage"
        :selected="isSelected(layerSel(plate.id))"
        :hidden="hidden.has(layerKey(plate.id))"
        @select="emit('select', layerSel(plate.id))"
        @toggle="emit('toggle', layerKey(plate.id))"
      />
    </section>

    <section aria-labelledby="studio-layers-cutouts" class="flex flex-col gap-1.5">
      <h2 id="studio-layers-cutouts" class="text-label uppercase text-muted-foreground">Cut-outs</h2>
      <!-- Nearest first, like a stack of cards: back to front follows depth, and within one depth a row drags. -->
      <StudioLayerRow
        v-for="layer in cutouts"
        :key="layer.id"
        :name="layerName(layer.id, layer.name)"
        :word="depthBand(layer.depth)"
        :thumb="layer.src"
        :icon="IconImage"
        :selected="isSelected(layerSel(layer.id))"
        :hidden="hidden.has(layerKey(layer.id))"
        draggable
        @select="emit('select', layerSel(layer.id))"
        @toggle="emit('toggle', layerKey(layer.id))"
        @dragstart="onDragStart($event, layer.id)"
        @dragover="onDragOver($event, layer)"
        @drop="onDrop($event, layer)"
      />
      <AppButton variant="outline" size="sm" block :icon="IconAddImage" label="Add a cut-out" aria-haspopup="dialog" @click="adding = true" />
      <AddCutoutDialog
        :open="adding"
        :nook-id="nookId"
        :scene="scene"
        @close="adding = false"
        @update="(change) => emit('update', change)"
        @added="(id) => emit('added', layerSel(id))"
      />
    </section>

    <section aria-labelledby="studio-layers-touches" class="flex flex-col gap-1.5">
      <h2 id="studio-layers-touches" class="text-label uppercase text-muted-foreground">Touches</h2>
      <StudioLayerRow
        v-for="touch in touches"
        :key="touch.index"
        :name="effectLabel(touch.effect)"
        :word="touchWord(touch.effect)"
        :icon="IconGenerate"
        :selected="isSelected(effectSel(touch.index))"
        :hidden="hidden.has(effectKey(touch.index))"
        @select="emit('select', effectSel(touch.index))"
        @toggle="emit('toggle', effectKey(touch.index))"
      />
      <MenuPopover label="Add a touch">
        <template #trigger="{ toggle, open }">
          <AppButton variant="outline" size="sm" block :icon="IconAdd" label="Add a touch" aria-haspopup="menu" :aria-expanded="open" @click="toggle" />
        </template>
        <template #default="{ close }">
          <AppButton
            v-for="entry in TOUCHES"
            :key="entry.kind"
            variant="menu"
            size="md"
            block
            class="rounded-none"
            role="menuitem"
            :label="entry.label"
            @click="() => { close(true); emit('addTouch', entry.kind); }"
          />
        </template>
      </MenuPopover>
    </section>
  </nav>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import MenuPopover from "@/components/common/overlays/MenuPopover.vue";
import AddCutoutDialog from "./addCutout/AddCutoutDialog.vue";
import StudioLayerRow from "./StudioLayerRow.vue";
import { IconAdd, IconAddImage, IconGenerate, IconImage } from "@/lib/icons";
import { depthBand, effectKey, effectLabel, layerKey, layerName, PICTURE_ID, TOUCHES, type Target } from "@/lib/bookNook/edit";
import type { TouchKind } from "@/lib/bookNook/presets";
import { layersOf, type Effect, type Layer, type Scene } from "@/lib/bookNook/scene";

/**
 * The studio's left column (frame 03): the picture, the cut-outs and the touches. Rows select; the eye hides
 * a thing in the studio only; "Add a cut-out" opens the four ways in and hands the scene change up; "Add a touch" lists the
 * touch kinds. Owns no scene state: everything goes up as an event.
 */
const { scene, selection, hidden, nookId } = defineProps<{
  scene: Scene;
  selection: Target | null;
  /** Hidden keys (`layerKey` / `effectKey`). */
  hidden: ReadonlySet<string>;
  /** The nook being edited: where a new cut-out's picture is stored and what a generated one is painted for. */
  nookId: string;
}>();

const emit = defineEmits<{
  select: [target: Target];
  toggle: [key: string];
  /** A change to the scene from the Add a cut-out dialog (one undo step). */
  update: [change: (scene: Scene) => Scene];
  /** A cut-out went in; select it. */
  added: [target: Target];
  addTouch: [kind: TouchKind];
  reorder: [id: string, onto: string];
}>();

const layerSel = (id: string): Target => ({ kind: "layer", id });
const effectSel = (index: number): Target => ({ kind: "effect", index });
function isSelected(t: Target): boolean {
  if (!selection || selection.kind !== t.kind) return false;
  return t.kind === "layer" ? selection.kind === "layer" && selection.id === t.id : selection.kind === "effect" && selection.index === t.index;
}

const layers = computed(() => layersOf(scene));
// The picture is found by its id: the stack follows depth, so a Far part (a view behind a transparent sky) sorts
// before it.
const plate = computed(() => layers.value.find((layer) => layer.id === PICTURE_ID));
const cutouts = computed(() => layers.value.filter((layer) => layer.id !== PICTURE_ID).reverse());
const touches = computed(() =>
  scene.stack.flatMap((item, index) => (item.kind === "layer" ? [] : [{ index, effect: item as Effect }])),
);

const WORDS: Record<Effect["kind"], string> = { light: "Light", steam: "Rising", motes: "Area", particles: "Area" };
const touchWord = (effect: Effect) => WORDS[effect.kind];

/** The Add a cut-out dialog is open. */
const adding = ref(false);

const dragging = ref<string | null>(null);
function onDragStart(event: DragEvent, id: string) {
  dragging.value = id;
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}
function sameDepth(layer: Layer): boolean {
  const from = layers.value.find((l) => l.id === dragging.value);
  return !!from && from.id !== layer.id && from.depth === layer.depth;
}
function onDragOver(event: DragEvent, layer: Layer) {
  if (sameDepth(layer)) event.preventDefault();
}
function onDrop(event: DragEvent, layer: Layer) {
  event.preventDefault();
  if (dragging.value && sameDepth(layer)) emit("reorder", dragging.value, layer.id);
  dragging.value = null;
}
</script>
