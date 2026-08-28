<template>
  <PageHeader :title="isNew ? 'New Dungeon Feature' : feature?.name || 'Loading…'">
    <div v-if="loading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <template v-else>
      <DungeonFeatureEditor
        v-if="isNew || isEditing"
        :key="feature?.id ?? 'new'"
        :feature="feature ?? null"
        :is-new="isNew"
      />
      <DungeonFeatureSheet
        v-else-if="feature"
        :key="feature.id"
        :feature="feature"
      />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useDungeonFeature } from "@/composables/dungeon-features/useDungeonFeatures";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import DungeonFeatureEditor from "@/components/dungeon-features/DungeonFeatureEditor.vue";
import DungeonFeatureSheet from "@/components/dungeon-features/DungeonFeatureSheet.vue";

const route     = useRoute();
const isNew     = computed(() => route.name === "dungeon-feature-new");
const isEditing = computed(() => route.query.edit === "true");
const id        = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: feature, isLoading } = useDungeonFeature(id);
const loading = computed(() => !isNew.value && isLoading.value);
</script>
