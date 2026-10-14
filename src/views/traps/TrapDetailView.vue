<template>
  <PageHeader :title="isNew ? 'New Trap' : trap?.name || 'Loading…'">
    <div v-if="loading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <template v-else>
      <TrapEditor
        v-if="isNew || (isEditing && ownTrap)"
        :key="ownTrap?.id ?? 'new'"
        :trap="ownTrap ?? null"
        :is-new="isNew"
      />
      <TrapSheet
        v-else-if="trap"
        :key="trap.id"
        :trap="trap"
      />
      <DmNoteBox v-if="ownTrap && !isNew" class="mt-6" type="trap" :id="ownTrap.id" :label="ownTrap.name" />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useLibraryTrap, useTrap } from "@/composables/dungeon-features/useTraps";
import { isLibraryId } from "@/lib/dungeon-features/library";
import PageHeader from "@/components/common/list/PageHeader.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import DmNoteBox from "@/components/notes/DmNoteBox.vue";
import TrapEditor from "@/components/traps/TrapEditor.vue";
import TrapSheet from "@/components/traps/TrapSheet.vue";

const route     = useRoute();
const isNew     = computed(() => route.name === "trap-new");
const isEditing = computed(() => route.query.edit === "true");
const id        = computed(() => (isNew.value ? "" : (route.params.id as string)));

// A library id is a slug, never a uuid: it reads `library_traps` and shows the
// sheet read-only (`?edit=true` has nothing to open). A uuid reads the DM's own.
const libraryId = computed(() => (isLibraryId(id.value) ? id.value : ""));
const ownId     = computed(() => (libraryId.value ? "" : id.value));
const { data: ownTrap, isLoading: ownLoading } = useTrap(ownId);
const { data: libraryTrap, isLoading: libraryLoading } = useLibraryTrap(libraryId);
const trap = computed(() => ownTrap.value ?? libraryTrap.value ?? null);
const loading = computed(() => !isNew.value && (ownLoading.value || libraryLoading.value));
</script>
