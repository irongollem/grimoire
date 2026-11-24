<template>
  <!--
    Every AI generator panel, mounted together. Each renders nothing visually
    until its own open flag flips (see the `v-if` on each panel's root), so
    mounting the whole set costs nothing at runtime.

    To add a new generator: mount its panel here, register it in its
    useXxxGeneration.ts via registerAiGenerator(), and that's it.
  -->
  <!-- Add Sound hosts music generation (useMusicGeneration). -->
  <AddSoundDialog v-if="mountedAddSoundDialog" />
</template>

<script setup lang="ts">
// This host is mounted at boot (see DefaultLayout.vue) and must stay cheap:
// every panel is its own async chunk, fetched the first time its flag opens, so
// the panels' closure (Tiptap, the discipline tables, the generation
// composables) never rides along on a page that does not use one. Nothing
// heavy may be imported statically here.
import { defineAsyncComponent, type Component } from "vue";
import GeneratorPanelLoading from "@/components/common/ai/GeneratorPanelLoading.vue";
import { useSoundboardUiStore } from "@/stores/ui/soundboard";
import { storeToRefs } from "pinia";
import { useLazyMount } from "@/composables/useLazyMount";

// The delay keeps a fast load invisible. Registration in the AI generator
// registry happens when a panel's generation module evaluates, i.e. on first
// open; the registry is reactive, so the badge and analytics pick entries up
// as they arrive and nothing can be generating before a panel has opened.
function lazyPanel<T extends Component>(loader: () => Promise<T>) {
  return defineAsyncComponent({ loader, loadingComponent: GeneratorPanelLoading, delay: 200 });
}

const AddSoundDialog = lazyPanel(() => import("@/components/soundboard/AddSoundDialog.vue"));

const soundboardUi = useSoundboardUiStore();
// A panel mounts the first time its flag opens and stays mounted: its setup
// pulls credits, provider config, party and library reads that a closed panel
// has no use for (22 of them ran at boot), while a dismissed generation lives
// in the panel's own generateAndCreate and must outlive the panel closing.
const { addSoundDialogOpen } = storeToRefs(soundboardUi);
const mountedAddSoundDialog = useLazyMount(addSoundDialogOpen);

</script>
