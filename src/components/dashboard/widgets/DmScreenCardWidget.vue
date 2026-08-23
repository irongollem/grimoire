<template>
  <DashboardWidget
    :title="table === undefined ? 'DM screen card' : table.title"
    to="/rules?tab=screen"
    action-label="Screen →"
    :empty="table === undefined"
    empty-text="That reference table is no longer in the DM screen."
  >
    <ScreenReferenceTable v-if="table !== undefined" :table="table" density="compact" />
  </DashboardWidget>
</template>

<script setup lang="ts">
/**
 * One reference table from the DM screen, clipped to the dashboard (#764).
 *
 * The reason the customizable-dashboard epic exists: a paper DM screen is a
 * handful of tables the DM chose, in front of them the whole session, and
 * Grimoire kept all of it one tab-click away inside `/rules`. So this widget is
 * deliberately the thinnest possible thing — the table, its own title, and a
 * way back to the full screen.
 *
 * It is also the first widget with per-instance settings, and the first with
 * `maxInstances > 1`, because those two facts are the same fact: a screen with
 * one table on it is not a screen. Which table an instance shows lives in its
 * layout entry (`settings.tableId`), not in the registry — see
 * `src/lib/dashboard/dmScreenCard.ts` and `DmScreenCardSettings.vue`.
 *
 * No `maxHeight="none"`: a long table (the spell-slot grid is fifteen rows)
 * scrolls inside the card, which is what keeps six of these from turning the
 * dashboard into a document.
 */
import { computed } from "vue";
import DashboardWidget from "@/components/dashboard/DashboardWidget.vue";
import ScreenReferenceTable from "@/components/rules/ScreenReferenceTable.vue";
import { resolveDmScreenTable } from "@/lib/dashboard/dmScreenCard";

const { settings } = defineProps<{
  /** This instance's layout entry settings — absent until the DM configures it. */
  settings?: Record<string, unknown>;
}>();

const table = computed(() => resolveDmScreenTable(settings));
</script>
