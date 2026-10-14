<template>
  <div
    class="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2"
    role="status"
    data-testid="caretaking-notice"
  >
    <p class="min-w-0 flex-1 text-caption text-muted-foreground italic">{{ message }}</p>
    <AppButton
      variant="subtle"
      size="xs"
      class="shrink-0 max-md:min-h-11"
      :label="actionLabel"
      :loading="busy"
      :disabled="busy"
      @click="emit('action')"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * A quiet line on a character's sheet while it is handed over (#1059): to the
 * caretaker "You're looking after Mira for Tomas" with Hand back, to the owner
 * "Tomas is looking after Mira" with Take back. Informational, not a banner.
 */
import AppButton from "@/components/common/controls/AppButton.vue";

defineProps<{ message: string; actionLabel: string; busy?: boolean }>();
const emit = defineEmits<{ action: [] }>();
</script>
