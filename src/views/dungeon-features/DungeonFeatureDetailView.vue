<template>
  <PageHeader :title="isNew ? 'New Dungeon Feature' : feature?.name || 'Loading…'">
    <div v-if="loading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <template v-else>
      <DungeonFeatureEditor
        v-if="isNew || (isEditing && ownFeature)"
        :key="ownFeature?.id ?? 'new'"
        :feature="ownFeature ?? null"
        :is-new="isNew"
      />
      <DungeonFeatureSheet
        v-else-if="feature"
        :key="feature.id"
        :feature="feature"
      />
      <DmNoteBox v-if="ownFeature && !isNew" class="mt-6" type="dungeon_feature" :id="ownFeature.id" :label="ownFeature.name" />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useDungeonFeature, useLibraryDungeonFeature } from "@/composables/dungeon-features/useDungeonFeatures";
import { isLibraryId } from "@/lib/dungeon-features/library";
import PageHeader from "@/components/common/list/PageHeader.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import DmNoteBox from "@/components/notes/DmNoteBox.vue";
import DungeonFeatureEditor from "@/components/dungeon-features/DungeonFeatureEditor.vue";
import DungeonFeatureSheet from "@/components/dungeon-features/DungeonFeatureSheet.vue";

const route     = useRoute();
const isNew     = computed(() => route.name === "dungeon-feature-new");
const isEditing = computed(() => route.query.edit === "true");
const id        = computed(() => (isNew.value ? "" : (route.params.id as string)));

// A library id is a slug, never a uuid: it reads `library_dungeon_features` and
// shows the sheet read-only. A uuid reads the DM's own.
const libraryId = computed(() => (isLibraryId(id.value) ? id.value : ""));
const ownId     = computed(() => (libraryId.value ? "" : id.value));
const { data: ownFeature, isLoading: ownLoading } = useDungeonFeature(ownId);
const { data: libraryFeature, isLoading: libraryLoading } = useLibraryDungeonFeature(libraryId);
const feature = computed(() => ownFeature.value ?? libraryFeature.value ?? null);
const loading = computed(() => !isNew.value && (ownLoading.value || libraryLoading.value));
</script>
