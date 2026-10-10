<template>
  <section class="rounded-lg border border-border bg-muted/20">
    <header class="flex items-center gap-2 px-3 py-2 border-b border-border">
      <h3 class="flex-1 text-label-lg font-semibold text-muted-foreground">{{ title }}</h3>
      <AppButton
        v-if="removable"
        variant="ghost"
        tone="danger"
        size="xs"
        :icon="IconDelete"
        icon-size="xs"
        :label="removeLabel"
        @click="emit('remove')"
      />
    </header>
    <div class="p-3 flex flex-col gap-3">
      <p v-if="hint" class="text-caption text-muted-foreground">{{ hint }}</p>
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import { IconDelete } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";

const { removable = true, removeLabel = "Remove" } = defineProps<{
  title: string;
  hint?: string;
  removable?: boolean;
  removeLabel?: string;
}>();
const emit = defineEmits<{ remove: [] }>();
</script>
