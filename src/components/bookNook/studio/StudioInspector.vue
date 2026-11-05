<template>
  <section class="flex flex-col gap-4 p-3" aria-label="Selected thing">
    <p v-if="!subject" class="text-body text-muted-foreground">Pick something on the stage or in the list to change it.</p>
    <template v-else>
      <header class="flex flex-col gap-1">
        <p class="text-label uppercase tracking-wider text-muted-foreground">{{ subject.kind }}</p>
        <h2 v-if="subject.picture" class="truncate text-heading-sm font-bold text-foreground">{{ subject.name }}</h2>
        <AppInput
          v-else
          v-model="nameDraft"
          tone="underline"
          size="body"
          class="w-full"
          :placeholder="subject.derived"
          aria-label="Name"
          @update:model-value="rename"
        />
      </header>

      <PicturePanel v-if="subject.picture" :scene="scene" @replace-room="emit('replace-room')" />
      <CutoutPanel v-else-if="subject.layer" :layer="subject.layer" :scene="scene" :aspect="aspects.get(subject.layer.id)" :apply="apply" @side-view="emit('side-view')" />
      <TouchPanel v-else-if="subject.effect && target?.kind === 'effect'" :effect="subject.effect" :index="target.index" :scene="scene" :apply="apply" @side-view="emit('side-view')" />

      <AppButton v-if="!subject.picture" variant="destructive" size="sm" :icon="IconDelete" label="Delete" @click="remove" />
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import CutoutPanel from "@/components/bookNook/studio/inspector/CutoutPanel.vue";
import PicturePanel from "@/components/bookNook/studio/inspector/PicturePanel.vue";
import TouchPanel from "@/components/bookNook/studio/inspector/TouchPanel.vue";
import { useConfirm } from "@/composables/useConfirm";
import { effectLabel, layerName, PICTURE_ID, targetKey, type StudioOp, type Target } from "@/lib/bookNook/edit";
import { layersOf, type Effect, type Layer, type Scene } from "@/lib/bookNook/scene";
import { IconDelete } from "@/lib/icons";

/**
 * The right column (frames 03, 05, 05b): what is selected, named in its own title, and the panel for its kind: a
 * cut-out's hold, depth, motion, shadows and wall; a touch's source and amount; the picture's size. It reads the
 * selection (`target`), the `scene` it lives in and each image's `aspects`, and every change goes through
 * `apply`, the one door. Depth is only shown here: it is set in the side view.
 */
const { target, scene, aspects, apply } = defineProps<{
  target: Target | null;
  scene: Scene;
  /** Each layer's image height over its width, by id, once its picture has loaded. */
  aspects: ReadonlyMap<string, number>;
  apply: (op: StudioOp) => void;
}>();
const emit = defineEmits<{ "side-view": []; "replace-room": [] }>();

const { confirm } = useConfirm();

const subject = computed<{ kind: string; name: string; derived: string; picture: boolean; layer?: Layer; effect?: Effect } | null>(() => {
  if (!target) return null;
  if (target.kind === "layer") {
    const layer = layersOf(scene).find((l) => l.id === target.id);
    if (!layer) return null;
    const picture = layer.id === PICTURE_ID;
    return { kind: picture ? "The picture" : "Cut-out", name: layerName(layer.id, layer.name), derived: layerName(layer.id), picture, layer };
  }
  const effect = scene.stack[target.index];
  if (!effect || effect.kind === "layer") return null;
  return { kind: "Touch", name: effectLabel(effect), derived: effectLabel({ ...effect, name: undefined }), picture: false, effect };
});

// The title is typed into, so it keeps its own text while the scene follows; it is reset when the selection moves.
const nameDraft = ref("");
watch(
  () => (target ? targetKey(target) : null),
  () => { nameDraft.value = subject.value && !subject.value.picture ? subject.value.name : ""; },
  { immediate: true },
);

function rename(value: string | number | null | undefined) {
  if (!target || subject.value?.picture) return;
  apply({ op: "rename", target, name: typeof value === "string" ? value : "" });
}

async function remove() {
  if (!target || !subject.value) return;
  const ok = await confirm(`Remove ${subject.value.name.toLowerCase()} from this nook?`, {
    title: "Delete",
    confirmLabel: "Delete",
  });
  if (ok) apply({ op: "remove", target });
}
</script>
