<template>
  <PageHeader
    :title="location?.name || (isNew ? 'New Location' : 'Loading…')"
    :description="location ? LOCATION_TYPE_LABELS[location.location_type] : undefined"
  >
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <LocationEditor
      v-else
      :key="id || 'new'"
      :location="isNew ? null : (location ?? null)"
      :parent-id="parentId ?? null"
      :initial-name="initialName"
    />
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useLocation } from "@/composables/useLocations";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import LocationEditor from "@/components/locations/LocationEditor.vue";
import { LOCATION_TYPE_LABELS } from "@/types/location.types";

const route      = useRoute();
const isNew      = computed(() => route.name === "location-new");
const id         = computed(() => (isNew.value ? "" : (route.params.id as string)));
const parentId   = computed(() => (route.query.parent as string | undefined));
const initialName = computed(() => (route.query.name as string | undefined));

const { data: location, isLoading: locLoading } = useLocation(id);
const isLoading = computed(() => !isNew.value && locLoading.value);
</script>
