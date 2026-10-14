<template>
  <!-- The strip over a read-only library row: what it is, and the one button that
       turns it into the DM's own editable copy (Customize / Use in campaign). -->
  <div
    class="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/50 px-4 py-2.5"
    data-testid="library-read-only-banner"
  >
    <p class="text-body text-muted-foreground italic">{{ message }}</p>
    <AppButton
      variant="primary"
      size="md"
      class="shrink-0"
      :disabled="busy || disabled"
      :icon="icon"
      :label="busy ? busyLabel : actionLabel"
      :tooltip="disabled ? disabledReason : undefined"
      @click="emit('action')"
    />
  </div>
</template>

<script setup lang="ts">
import type { Component } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { IconCopy } from "@/lib/icons";

const {
  message,
  actionLabel,
  busyLabel,
  busy = false,
  disabled = false,
  disabledReason,
  icon = IconCopy,
} = defineProps<{
  message: string;
  actionLabel: string;
  busyLabel: string;
  busy?: boolean;
  disabled?: boolean;
  /** Tooltip shown while `disabled` (why the button cannot be pressed). */
  disabledReason?: string;
  icon?: Component;
}>();

const emit = defineEmits<{ action: [] }>();
</script>
