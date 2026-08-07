<template>
  <template v-if="detailRef">
    <AppButton
      v-if="exists"
      label="Delete"
      :icon="IconDelete"
      variant="destructive"
      size="md"
      collapse-below="lg"
      collapse-label-on-mobile
      @click="detailRef.remove()"
    />
    <AppButton
      :disabled="!detailRef.canSave"
      :label="detailRef.saving ? 'Saving…' : exists ? 'Save' : 'Create'"
      :icon="IconSave"
      variant="primary"
      size="md"
      collapse-below="lg"
      @click="detailRef.save()"
    />
  </template>
</template>

<script setup lang="ts">
import { IconDelete, IconSave } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";

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
