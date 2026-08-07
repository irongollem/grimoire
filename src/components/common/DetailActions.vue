<template>
  <template v-if="detailRef">
    <PageHeaderAction
      v-if="exists"
      label="Delete"
      :icon="IconDelete"
      variant="destructive"
      @click="detailRef.remove()"
    />
    <PageHeaderAction
      :disabled="!detailRef.canSave"
      :label="detailRef.saving ? 'Saving…' : exists ? 'Save' : 'Create'"
      :icon="IconSave"
      variant="primary"
      :collapse-label-on-mobile="false"
      @click="detailRef.save()"
    />
  </template>
</template>

<script setup lang="ts">
import { IconDelete, IconSave } from '@/lib/icons';
import PageHeaderAction from "@/components/common/PageHeaderAction.vue";

interface ExposedDetail {
  saving: boolean;
  canSave: boolean;
  save: () => Promise<void>;
  remove: () => Promise<void>;
}

defineProps<{
  detailRef: ExposedDetail | null;
  exists: boolean;
}>();
</script>
