<template>
  <PageHeader title="New Location">
    <LocationEditor
      :location="null"
      :parent-id="parentId ?? null"
      :initial-name="initialName"
    />
  </PageHeader>
</template>

<script setup lang="ts">
/**
 * Creating a place is the one thing the Atlas cannot do without a row to
 * select yet, so it keeps its own page. Every other place surface — view,
 * edit, build, run — lives inside the Atlas at `/locations?at=<id>` (see
 * `placeRoute`); this view exists only for the moment before a place has an
 * id to open there.
 */
import { computed } from "vue";
import { useRoute } from "vue-router";
import PageHeader from "@/components/common/PageHeader.vue";
import LocationEditor from "@/components/locations/LocationEditor.vue";

const route = useRoute();
const parentId = computed(() => route.query.parent as string | undefined);
const initialName = computed(() => route.query.name as string | undefined);
</script>
