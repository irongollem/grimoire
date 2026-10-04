<template>
  <div class="flex flex-col items-center gap-1">
    <AppButton
      variant="outline"
      fill="muted"
      size="sm"
      :loading="loading"
      :disabled="disabled"
      @click="emit('paint')"
    >
      <template #icon>
        <IconGenerate class="h-3.5 w-3.5" />
      </template>
      {{ loading ? "Painting…" : "Paint portrait" }}
    </AppButton>
    <GenerationCostBadge v-if="!loading" :credits="cost" :byok="byok" :show-balance="false" />
    <p v-if="error" class="text-caption text-destructive text-center">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/AppButton.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import { IconGenerate } from "@/lib/icons";

/**
 * The "Paint portrait" action for an entity with no picture (The Mint, Card
 * Forge). Presentation only: the caller owns `useMissingPortrait`, so one
 * painter serves a whole list and only one paint runs at a time.
 */
defineProps<{
  loading: boolean;
  /** True while any paint runs, or the caller cannot paint this entity. */
  disabled: boolean;
  cost: number;
  byok: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{ paint: [] }>();
</script>
