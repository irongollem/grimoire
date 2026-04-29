<template>
  <PageHeader :title="isNew ? 'New Pantheon' : pantheon?.name || 'Loading…'">
    <div v-if="loading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <template v-else>
      <PantheonEditor
        v-if="isNew || isEditing"
        :key="pantheon?.id ?? 'new'"
        :pantheon="pantheon ?? null"
        :is-new="isNew"
      />
      <PantheonSheet
        v-else-if="pantheon"
        :key="pantheon.id"
        :pantheon="pantheon"
      />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { usePantheon } from "@/composables/useDeities";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import PantheonEditor from "@/components/pantheons/PantheonEditor.vue";
import PantheonSheet from "@/components/pantheons/PantheonSheet.vue";

const route     = useRoute();
const isNew     = computed(() => route.name === "pantheon-new");
const isEditing = computed(() => route.query.edit === "true");
const id        = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: pantheon, isLoading: pantheonLoading } = usePantheon(id);
const loading = computed(() => !isNew.value && pantheonLoading.value);
</script>
