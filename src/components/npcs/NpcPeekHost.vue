<template>
  <NpcDetailModal v-if="peekId" :key="peekId" :id="peekId" @close="close" />
</template>

<script setup lang="ts">
/** Renders the NPC peek (useNpcPeek). Any navigation, such as the sheet's Edit, closes it. */
import { defineAsyncComponent, watch } from "vue";
import { useRoute } from "vue-router";
import { useNpcPeek } from "@/composables/npcs/useNpcPeek";

// The sheet is heavy and the layout boots with the app: load it on the first peek, not at startup.
const NpcDetailModal = defineAsyncComponent(() => import("@/components/npcs/NpcDetailModal.vue"));

const { peekId, close } = useNpcPeek();
const route = useRoute();
watch(() => route.fullPath, close);
</script>
