<template>
  <DashboardWidget
    :title="title"
    to="/dungeon-craft?tab=roll-tables"
    action-label="Tables →"
    :loading="resolution === null"
    :empty="resolution !== null && resolution.state !== 'ready'"
  >
    <template #empty>
      <p v-if="resolution?.state === 'missing'" class="text-body text-muted-foreground italic">
        That roll table is no longer in this campaign. Pick another one from this card's settings.
      </p>
      <p v-else class="text-body text-muted-foreground italic">
        No roll tables yet — build one and it appears here.
      </p>
    </template>

    <div v-if="resolution?.state === 'ready'" class="flex flex-col gap-3 p-3">
      <AppButton
        variant="primary"
        size="md"
        :icon="IconDiceRoll"
        :label="`Roll ${resolution.table.dice}`"
        :disabled="resolution.table.entries.length === 0"
        tooltip="Roll this table without leaving the dashboard"
        @click="onRoll"
      />
      <RollTableResult v-if="lastRoll !== null" :result="lastRoll" />
      <p class="text-caption-sm text-muted-foreground italic">
        {{ resolution.table.entries.length }}
        {{ resolution.table.entries.length === 1 ? "entry" : "entries" }}
      </p>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
/**
 * One saved roll table, rollable in place (#764).
 *
 * The entity has existed since #120 and was reachable only from Dungeon Craft,
 * which is a workshop — you go there to *build* a wandering-monster table, not
 * to use one mid-session. This is the using half: the DM pins the table they
 * roll on, and it is on the board when the party wanders off the map.
 *
 * Configurable and multi-instance for the same reason as the DM screen card:
 * a DM who rolls Wandering Monsters also rolls Tavern Rumors, and two cards is
 * the honest shape of that. See `src/lib/dashboard/rollTableCard.ts` for why
 * resolution has three states rather than two.
 *
 * The result is a local `ref` and is deliberately not layout state: a roll is
 * a thing that just happened, not part of the arrangement, and persisting it
 * would have the dashboard reopen tomorrow claiming the party met six goblins.
 */
import { computed, ref, watch } from "vue";
import DashboardWidget from "@/components/dashboard/DashboardWidget.vue";
import AppButton from "@/components/common/AppButton.vue";
import RollTableResult from "@/components/dungeon-features/RollTableResult.vue";
import { useRollTables } from "@/composables/dungeon-features/useRollTables";
import { IconDiceRoll } from "@/lib/icons";
import { resolveRollTable, type RollTableResolution } from "@/lib/dashboard/rollTableCard";
import { rollOnTable, type RollTableRollResult } from "@/lib/rollTableRoll";

const { settings } = defineProps<{
  settings?: Record<string, unknown>;
}>();

const { data: tables } = useRollTables();

/**
 * `null` while the query has not answered yet — which is a different thing
 * from a campaign that has no roll tables, and the card says something
 * different for each. Collapsing the two (the tempting `tables.value ?? []`)
 * would flash "No roll tables yet" at every DM on every page load.
 */
const resolution = computed<RollTableResolution | null>(() => {
  const loaded = tables.value;
  if (loaded === undefined) return null;
  return resolveRollTable(settings, loaded);
});

const title = computed(() =>
  resolution.value?.state === "ready" ? resolution.value.table.name : "Roll a table",
);

const lastRoll = ref<RollTableRollResult | null>(null);

// A result belongs to the table it came from. Switching this card to another
// table — or to another campaign — must not leave yesterday's goblins under a
// new heading, which is exactly what it looked like before this watch.
watch(
  () => (resolution.value?.state === "ready" ? resolution.value.table.id : null),
  () => {
    lastRoll.value = null;
  },
);

function onRoll() {
  const current = resolution.value;
  if (current === null || current.state !== "ready") return;
  lastRoll.value = rollOnTable(current.table);
}
</script>
