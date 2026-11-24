<template>
  <!-- A press on one row alone: runs once, then says what it did and where to go. The preview stays open. -->
  <div class="flex flex-wrap items-center justify-end gap-2" :data-testid="testId">
    <template v-if="state?.phase === 'done'">
      <span class="inline-flex items-center gap-1 text-label-lg font-semibold text-ink-success" data-testid="ask-preview-row-done">
        <IconCheck class="size-3.5" />
        {{ state.doneLabel }}
      </span>
      <AppButton v-for="link in state.links ?? []" :key="link.route" variant="link" size="inline-caption" :label="link.label" :to="link.route" data-testid="ask-preview-row-link" />
      <span v-if="state.error" class="w-full text-right text-caption text-ink-caution" data-testid="ask-preview-row-note">{{ state.error }}</span>
    </template>
    <template v-else>
      <span v-if="state?.error" class="min-w-0 flex-1 text-caption text-destructive" role="alert" data-testid="ask-preview-row-error">{{ state.error }}</span>
      <AppButton
        variant="outline"
        size="xs"
        :class="{ 'min-h-11': mobile }"
        :loading="state?.phase === 'running'"
        :disabled="busy"
        :label="action.label"
        data-testid="ask-preview-row-action"
        @click="emit('act')"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * One preview row's own press (#1270): the button, its done mark and links, the error it came back with. Drawn under a
 * row's label and value, or inside a spoken row's speech bubble. It holds no state; the conversation owns the phase.
 */
import { IconCheck } from "@/lib/icons";
import type { AskPreviewRow } from "@/lib/ask/askAdapter";
import type { PreviewRowState } from "@/composables/ask/askItems";
import AppButton from "@/components/common/controls/AppButton.vue";

defineProps<{
  action: NonNullable<AskPreviewRow["action"]>;
  state: PreviewRowState | undefined;
  busy: boolean;
  mobile: boolean;
  testId: string;
}>();
const emit = defineEmits<{ act: [] }>();
</script>
