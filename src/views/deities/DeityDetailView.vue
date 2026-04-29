<template>
  <PageHeader :title="isNew ? 'New Deity' : deity?.name || 'Loading…'">
    <div v-if="loading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <template v-else>
      <DeityEditor
        v-if="isNew || isEditing"
        :key="deity?.id ?? 'new'"
        :deity="deity ?? null"
        :is-new="isNew"
      />
      <DeitySheet
        v-else-if="deity"
        :key="deity.id"
        :deity="deity"
      />
    </template>
  </PageHeader>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useDeity } from "@/composables/useDeities";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import DeityEditor from "@/components/deities/DeityEditor.vue";
import DeitySheet from "@/components/deities/DeitySheet.vue";

const route     = useRoute();
const isNew     = computed(() => route.name === "deity-new");
const isEditing = computed(() => route.query.edit === "true");
const id        = computed(() => (isNew.value ? "" : (route.params.id as string)));

const { data: deity, isLoading: deityLoading } = useDeity(id);
const loading = computed(() => !isNew.value && deityLoading.value);
</script>
