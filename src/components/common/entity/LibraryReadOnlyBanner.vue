<template>
  <!-- The strip over a read-only library row: which book it is from, and the one
       button that turns it into the DM's own editable copy (Customize / Use in campaign). -->
  <div
    class="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/50 px-4 py-2.5"
    data-testid="library-read-only-banner"
  >
    <p class="text-body text-muted-foreground italic">
      <template v-if="book">From <span class="font-semibold not-italic text-foreground">{{ book }}</span>, read only.</template>
      <template v-else>Read only.</template>
      {{ message }}
    </p>
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
import { computed, type Component } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { useSourceTitles } from "@/composables/library/useSourceTitles";
import { IconCopy } from "@/lib/icons";

const {
  source,
  sourceTitle,
  message,
  actionLabel,
  busyLabel,
  busy = false,
  disabled = false,
  disabledReason,
  icon = IconCopy,
} = defineProps<{
  /** The row's `source` key; the banner opens with the book's title. */
  source: string | null | undefined;
  /** A title the row carries (`source_title`), for a key that is not a known book. */
  sourceTitle?: string | null;
  /** How to get an editable copy, after "From <book>, read only." */
  message: string;
  actionLabel: string;
  busyLabel: string;
  busy?: boolean;
  disabled?: boolean;
  /** Tooltip shown while `disabled` (why the button cannot be pressed). */
  disabledReason?: string;
  icon?: Component;
}>();

const { labelFor } = useSourceTitles();
const book = computed(() => labelFor(source, sourceTitle));

const emit = defineEmits<{ action: [] }>();
</script>
