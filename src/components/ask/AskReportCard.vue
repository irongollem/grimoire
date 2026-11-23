<template>
  <section class="flex flex-col gap-2.5 border border-border bg-card px-3 py-2.5" :aria-label="heading" data-testid="ask-report">
    <h3 class="text-label-lg font-semibold text-gold-500">{{ heading }}</h3>
    <dl class="flex flex-col gap-1.5 text-body">
      <div v-for="field in fields" :key="field.label" class="flex flex-col">
        <dt class="text-caption text-muted-foreground">{{ field.label }}</dt>
        <dd class="whitespace-pre-line">{{ field.value }}</dd>
      </div>
    </dl>
    <AppButton variant="primary" size="sm" class="self-start" label="Review and send…" data-testid="ask-report-review" @click="emit('review')" />
    <!-- The consent line: this card files nothing, only the form's own Send button does. -->
    <p class="text-caption text-muted-foreground">Nothing is sent until you press Send in the form.</p>
  </section>
</template>

<script setup lang="ts">
/** A bug report or feature request Ask drafted. It shows the draft and opens the report form; it sends nothing. */
import { computed } from "vue";
import type { AskReportDraft } from "@edge-shared/agent/askContract";
import AppButton from "@/components/common/controls/AppButton.vue";

const { report } = defineProps<{ report: AskReportDraft }>();
const emit = defineEmits<{ review: [] }>();

const heading = computed(() => (report.kind === "bug" ? "Bug report" : "Feature request"));

/** The fields in the form's order. An empty one (the form's "Where" is optional for a feature) is left out. */
const fields = computed(() => {
  const all =
    report.kind === "bug"
      ? [
          { label: "Where", value: report.where },
          { label: "What you did", value: report.action },
          { label: "Expected", value: report.expected },
          { label: "What happened", value: report.actual },
        ]
      : [
          { label: "Where", value: report.where },
          { label: "What you want", value: report.summary },
          { label: "Why", value: report.problem },
        ];
  return all.filter((f) => f.value.trim() !== "");
});
</script>
