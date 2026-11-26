<template>
  <section class="flex flex-col gap-1.5 border border-border bg-card p-4" aria-labelledby="tonight-plan-heading" data-testid="tonight-plan-line">
    <h2 id="tonight-plan-heading" class="m-0 text-heading-sm">What you mean to happen</h2>
    <AppInput v-model="draft.text" wrap size="body" tone="filled" aria-label="What you mean to happen" :maxlength="PLAN_LINE_MAX" placeholder="Open on the burned mill; Mira learns about her mother…" />
    <AutosaveStatus :status="status" :error="saveError" />
  </section>
</template>

<script setup lang="ts">
/**
 * The one line of intent for the next session (#1279 item 20), saved as it is typed. Empty removes it. Players never read it.
 */
import { reactive, watch } from "vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import { PLAN_LINE_MAX, useSavePlanLine } from "@/composables/canon/useTonightPlan";
import { useAutosave } from "@/composables/useAutosave";

const { saved } = defineProps<{ /** The line as stored; null when none is written. */ saved: string | null }>();

interface LineDraft { text: string }
const draft = reactive<LineDraft>({ text: saved ?? "" });
const save = useSavePlanLine();
const { status, saveError, dirty, reset } = useAutosave<LineDraft>({
  draft,
  initial: () => ({ text: saved ?? "" }),
  equal: (a, b) => a.text.trim() === b.text.trim(),
  save: (snapshot) => save(snapshot.text),
  errorMessage: "Could not save the plan",
});
// What arrives from the doorbell (another tab) replaces the box only while nothing here is unsaved.
watch(() => saved, (next) => {
  if (!dirty.value && (next ?? "") !== draft.text) reset({ text: next ?? "" });
});
</script>
