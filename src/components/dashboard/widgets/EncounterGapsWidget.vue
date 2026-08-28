<template>
  <DashboardWidget
    title="Missing pieces"
    tone="caution"
    :count="rows.length || null"
    to="/encounters"
    action-label="Encounters →"
    :loading="isLoading"
    :empty="!isLoading && !rows.length"
    empty-text="Every encounter is ready to run."
  >
    <div class="divide-y divide-border">
      <RouterLink
        v-for="row in rows"
        :key="row.encounterId"
        :to="`/encounters/${row.encounterId}`"
        class="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors group"
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-cinzel text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
            {{ row.encounterName }}
          </p>
          <p class="text-caption text-muted-foreground italic">Missing {{ reasonText(row.gaps) }}</p>
        </div>
        <AppButton
          as="span"
          variant="tinted"
          tone="caution"
          emphasis="soft"
          size="xs"
          class="shrink-0"
          :label="String(row.gaps.length)"
        />
      </RouterLink>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import { useEncounters } from "@/composables/encounters/useEncounters";
import { deriveEncounterGapRows, ENCOUNTER_GAP_LABELS, type EncounterGapKind } from "@/lib/dashboard/encounterGaps";
import DashboardWidget from "../DashboardWidget.vue";

/**
 * Built encounters that are not actually ready to run (#764).
 *
 * `Encounter` carries several fields a DM fills in while prepping — where it
 * happens, who it fights, what it pays out — and nothing on the dashboard
 * previously said when one of those was still blank. `deriveEncounterGapRows`
 * (src/lib/dashboard/encounterGaps.ts) owns which fields count as gaps and
 * why; this widget only turns the result into a row.
 *
 * Sibling to PrepGapsWidget and QuestLootWidget — same card shell, same
 * caution tone (this asks the DM to go fix something), same "count badge +
 * one-line reason" row shape.
 */
const { data: encounters, isLoading } = useEncounters();

// `isLoading` from useQuery, not `data === undefined` — a query that errored
// also leaves `data` undefined but is no longer loading, and this widget has
// no error state of its own to show, so it should stop spinning rather than
// spin forever.
const rows = computed(() => {
  // Guarded rather than `?? []`: while the query is still loading (or has
  // errored without data) there is nothing to derive gaps from yet — that is
  // "no rows to show", which `isLoading` above already distinguishes from
  // "checked every encounter and found none missing anything".
  if (encounters.value === undefined) return [];
  return deriveEncounterGapRows(encounters.value);
});

function reasonText(gaps: EncounterGapKind[]): string {
  return gaps.map((gap) => ENCOUNTER_GAP_LABELS[gap]).join(", ");
}
</script>
