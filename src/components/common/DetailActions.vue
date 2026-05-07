<template>
  <template v-if="detailRef">
    <button
      v-if="exists"
      type="button"
      class="px-3 py-1.5 font-cinzel text-xs font-semibold tracking-wider text-destructive border border-destructive/40 rounded-md hover:bg-destructive/10 transition-colors"
      @click="detailRef.remove()"
    >
      Delete
    </button>
    <button
      type="button"
      :disabled="!detailRef.canSave"
      class="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-cinzel text-xs font-semibold text-primary-foreground tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
      @click="detailRef.save()"
    >
      <IconSave class="h-3.5 w-3.5" />
      {{ detailRef.saving ? "Saving…" : exists ? "IconSave" : "Create" }}
    </button>
  </template>
</template>

<script setup lang="ts">
import { IconSave } from '@/lib/icons';

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
