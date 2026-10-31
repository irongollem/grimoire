<template>
  <div class="h-dvh w-full">
    <PlayMap :encounter-id="id" mode="follower" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { useRoute } from "vue-router";
import PlayMap from "@/components/encounters/play/PlayMap.vue";
import { useAppUiStore } from "@/stores/ui/app";

/**
 * The Table screen: the map alone, full window, following the live fight. The DM opens it from the
 * Play bar for a second monitor or a screen the table can see. A later story turns it into the
 * players' own view (#1125).
 */
const route = useRoute();
const id = computed(() => route.params.id as string);

// Chromeless, like the Scriptorium: no sidebar or top bar on a screen the table looks at.
const appUi = useAppUiStore();
onMounted(() => {
  appUi.editorFocus = true;
});
onBeforeUnmount(() => {
  appUi.editorFocus = false;
});
</script>
