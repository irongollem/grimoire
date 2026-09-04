<template>
  <PageHeader
    :title="location?.name || (isNew ? 'New Location' : 'Loading…')"
    :description="location ? LOCATION_TYPE_LABELS[location.location_type] : undefined"
  >
    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <!-- New locations always go straight into the editor — no sheet to show
         until the row exists. Existing locations render the sheet by default
         and flip into the editor when `?edit=true` is present, matching the
         NPC / Monster / Item / Spell convention (#168). -->
    <LocationEditor
      v-else-if="isNew || isEditing"
      :key="id || 'new'"
      :location="isNew ? null : (location ?? null)"
      :parent-id="parentId ?? null"
      :initial-name="initialName"
    />
    <!-- Site runner (#791, epic #780) — same `?run=true` convention as
         `?edit=true` above. Only ever offered on a site-tier location (see
         LocationSheet's Run action); a stray `?run=true` on anything else
         falls through to the plain sheet below rather than erroring. -->
    <SiteRunSurface
      v-else-if="isRunning && location && isSiteType(location.location_type)"
      :key="location.id"
      :location="location"
    />
    <LocationSheet
      v-else-if="location"
      :key="location.id"
      :location="location"
    />
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useLocation } from "@/composables/locations/useLocations";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import LocationEditor from "@/components/locations/LocationEditor.vue";
import LocationSheet from "@/components/locations/LocationSheet.vue";
import SiteRunSurface from "@/components/locations/SiteRunSurface.vue";
import { isSiteType } from "@/lib/locations/tiers";
import { LOCATION_TYPE_LABELS } from "@/types/location.types";

const route      = useRoute();
const isNew      = computed(() => route.name === "location-new");
const isEditing  = computed(() => route.query.edit === "true");
const isRunning  = computed(() => route.query.run === "true");
const id         = computed(() => (isNew.value ? "" : (route.params.id as string)));
const parentId   = computed(() => (route.query.parent as string | undefined));
const initialName = computed(() => (route.query.name as string | undefined));

const { data: location, isLoading: locLoading } = useLocation(id);
const isLoading = computed(() => !isNew.value && locLoading.value);
</script>
