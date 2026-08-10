<template>
  <EncounterRunSurface :encounter-id="id" />
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import EncounterRunSurface from "@/components/encounters/EncounterRunSurface.vue";

const route = useRoute();
const id = computed(() => route.params.id as string);
</script>
