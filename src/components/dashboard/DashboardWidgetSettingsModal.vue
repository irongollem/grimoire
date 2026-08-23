<template>
  <AppModal :open="entry !== undefined" size="md" @close="emit('close')">
    <template v-if="entry !== undefined && widget !== undefined">
      <ModalHeader
        :title="widget.title"
        subtitle="Settings for this card only — other copies keep their own."
        :icon="IconSettings"
        tone="gold"
        closeable
        @close="emit('close')"
      />

      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
        <component
          :is="editor"
          v-if="editor !== undefined"
          :model-value="entry.settings"
          @update:model-value="(settings: Record<string, unknown>) => emit('save', entry.key, settings)"
        />
        <!-- Unreachable while `widgetComponents.test.ts` passes: it asserts
             every `configurable` widget has an editor and vice versa. Saying so
             beats an empty dialog with no explanation. -->
        <p v-else class="text-body text-muted-foreground italic">
          This widget has nothing to configure.
        </p>
      </div>

      <div class="flex shrink-0 justify-end border-t border-border px-5 py-3">
        <AppButton variant="subtle" size="sm" label="Done" @click="emit('close')" />
      </div>
    </template>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * The dialog behind Customize mode's per-widget gear (#764).
 *
 * It owns no settings shape of its own — it resolves the editor for whichever
 * widget was opened out of `WIDGET_SETTINGS_COMPONENTS` and hands it the
 * instance's blob. That indirection is the point: the second configurable
 * widget adds a file and a map entry, and never touches this dialog or the
 * view.
 *
 * **Edits apply immediately, and there is no Cancel.** Every other control in
 * Customize mode works that way — width cycles, removal, drag — and the whole
 * mode is saved by a debounce with a Reset-to-default escape hatch. A dialog
 * with OK/Cancel semantics sitting among them would be the only place in the
 * mode where a change is provisional, which is worse than either convention on
 * its own. "Done" closes; it does not commit.
 *
 * Driven by `entry` rather than a separate `open` flag so the view has one
 * piece of state (which key is being configured) instead of two that can
 * disagree.
 */
import { computed } from "vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import AppButton from "@/components/common/AppButton.vue";
import { IconSettings } from "@/lib/icons";
import { WIDGET_SETTINGS_COMPONENTS } from "@/components/dashboard/widgetComponents";
import { widgetById } from "@/lib/dashboard/widgetCatalog";
import type { DashboardLayoutEntry } from "@/lib/dashboard/defaultLayouts";

const { entry } = defineProps<{
  /** The instance being configured; `undefined` closes the dialog. */
  entry?: DashboardLayoutEntry;
}>();

const emit = defineEmits<{
  /** New settings for one instance key — the view applies them via `configureEntry`. */
  save: [key: string, settings: Record<string, unknown>];
  close: [];
}>();

const widget = computed(() => (entry === undefined ? undefined : widgetById(entry.id)));
const editor = computed(() =>
  widget.value === undefined ? undefined : WIDGET_SETTINGS_COMPONENTS[widget.value.id],
);
</script>
