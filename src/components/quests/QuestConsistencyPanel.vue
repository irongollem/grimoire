<template>
  <section
    v-if="findings.length"
    class="space-y-2 rounded-lg border border-border bg-card p-3"
    aria-label="Quest consistency"
  >
    <div>
      <h3 class="font-cinzel text-sm font-bold text-foreground">Consistency checks</h3>
      <p class="text-caption text-muted-foreground">Wiring gaps a graph can prove — no beat, objective or route guessed at.</p>
    </div>

    <ul v-if="primaryFindings.length" class="space-y-1.5">
      <li
        v-for="(finding, index) in primaryFindings"
        :key="findingKey(finding, index)"
        class="rounded-md border border-dashed border-tone-caution/50 bg-tone-caution/5 px-2 py-1.5 text-caption text-tone-caution"
      >
        {{ finding.message }}
      </li>
    </ul>

    <div v-if="advisoryFindings.length" class="space-y-1.5">
      <p class="text-label font-semibold text-muted-foreground">Not automated, not necessarily wrong</p>
      <ul class="space-y-1.5">
        <li
          v-for="(finding, index) in advisoryFindings"
          :key="findingKey(finding, index)"
          class="rounded-md border border-dashed border-border px-2 py-1.5 text-caption text-muted-foreground"
        >
          {{ finding.message }}
        </li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Presents `deriveQuestConsistency` findings (#832, out of #821) on the quest
 * Overview surface. Purely presentational — it owns no query and computes
 * nothing; the parent hands it the finished list.
 *
 * Silent when there is nothing to say: a permanently-present "all good" box
 * would be noise on the 14 of 19 real quests that have no findings at all, so
 * the whole section renders nothing rather than an empty-state message.
 */
import { computed } from "vue";
import type { QuestConsistencyFinding } from "@/lib/quests/consistency";

const { findings } = defineProps<{ findings: QuestConsistencyFinding[] }>();

// Advisory findings are true but not defects — see the field's docstring —
// so they read quieter and sit below whatever actually needs fixing.
const primaryFindings = computed(() => findings.filter((finding) => !finding.advisory));
const advisoryFindings = computed(() => findings.filter((finding) => finding.advisory));

function findingKey(finding: QuestConsistencyFinding, index: number): string {
  return [finding.kind, finding.edgeId, ...(finding.beatIds ?? []), ...(finding.objectiveIds ?? []), index]
    .filter((part): part is string => !!part)
    .join(":");
}
</script>
