<template>
  <AppModal :open="report !== null" size="md" @close="emit('close')">
    <ModalHeader title="Import brushes" :icon="IconAdd" tone="primary" closeable @close="emit('close')" />

    <div v-if="report" class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4" data-testid="brush-import-report">
      <p v-if="report.error" role="alert" class="text-body text-destructive" data-testid="brush-import-error">
        Nothing was added from {{ report.fileName }}. {{ report.error }}
      </p>
      <p v-else-if="report.added > 0" class="text-body text-foreground" data-testid="brush-import-added">
        {{ addedLine }}
      </p>
      <p v-else class="text-body text-foreground" data-testid="brush-import-added">Nothing was added from {{ report.fileName }}.</p>

      <section v-if="report.skipped.length > 0" class="space-y-1" data-testid="brush-import-skipped">
        <h3 class="text-eyebrow uppercase text-muted-foreground">Skipped ({{ report.skipped.length }})</h3>
        <ul class="space-y-1">
          <li v-for="(s, i) in report.skipped" :key="i" class="text-body">
            <span class="font-semibold text-foreground">{{ s.name }}</span>
            <span class="text-muted-foreground">: {{ s.reason }}</span>
          </li>
        </ul>
      </section>

      <section v-if="report.notes.length > 0" class="space-y-1">
        <AppButton
          variant="ghost"
          size="xs"
          :label="`${notesOpen ? 'Hide' : 'Show'} what did not carry over (${report.notes.length})`"
          :aria-expanded="notesOpen"
          data-testid="brush-import-notes-toggle"
          @click="notesOpen = !notesOpen"
        />
        <ul v-if="notesOpen" class="space-y-2" data-testid="brush-import-notes">
          <li v-for="(n, i) in report.notes" :key="i" class="text-caption">
            <span class="font-semibold text-foreground">{{ n.name }}</span>
            <ul class="list-disc pl-5 text-muted-foreground">
              <li v-for="(line, i) in n.notes" :key="i">{{ line }}</li>
            </ul>
          </li>
        </ul>
      </section>
    </div>

    <div class="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
      <AppButton variant="primary" label="Done" data-testid="brush-import-done" @click="emit('close')" />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * What a brush import did (#1181): how many brushes joined Yours, which were skipped and why, and, folded away
 * until asked for, what did not carry over from each. Names the file and its extensions, never other products.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import { IconAdd } from "@/lib/icons";
import type { ImportReport } from "../useBrushImport";

const { report } = defineProps<{ report: ImportReport | null }>();
const emit = defineEmits<{ close: [] }>();

const notesOpen = ref(false);
watch(
  () => report,
  () => {
    notesOpen.value = false;
  },
);

const addedLine = computed(() => {
  if (!report) return "";
  const n = report.added;
  return `Added ${n} ${n === 1 ? "brush" : "brushes"} from ${report.fileName} to Yours.`;
});
</script>
