<template>
  <PageHeader :title="isNew ? 'New Trap' : trap?.name || 'Loading…'">
    <div v-if="loading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>
    <template v-else>
      <TrapEditor
        v-if="isNew || isEditing"
        :key="trap?.id ?? 'new'"
        :trap="trap ?? null"
        :is-new="isNew"
      />
      <TrapSheet
        v-else-if="trap"
        :key="trap.id"
        :trap="trap"
      />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useTrap } from "@/composables/useTraps";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import TrapEditor from "@/components/traps/TrapEditor.vue";
import TrapSheet from "@/components/traps/TrapSheet.vue";

const route     = useRoute();
const isNew     = computed(() => route.name === "trap-new");
const isEditing = computed(() => route.query.edit === "true");
const id        = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: trap, isLoading } = useTrap(id);
const loading = computed(() => !isNew.value && isLoading.value);
</script>
