<template>
  <DashboardWidget
    title="Unidentified"
    tone="caution"
    :count="items.length"
    :empty="!items.length"
    empty-text="No pending items."
  >
    <div class="divide-y divide-border">
      <div v-for="entry in items" :key="entry.inv.id" class="flex items-center gap-3 px-4 py-2.5">
        <div class="min-w-0 flex-1">
          <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ entry.inv.name }}</p>
          <p class="text-caption text-muted-foreground italic">{{ entry.carrier ?? "Party stash" }}</p>
        </div>
        <AppButton
          variant="tinted"
          tone="caution"
          emphasis="outline"
          size="xs"
          class="shrink-0 cursor-pointer"
          label="Identify"
          @click="identify(entry.inv.id)"
        />
      </div>
    </div>
  </DashboardWidget>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useParty } from "@/composables/useParty";
import { usePartyInventory, useUpdateInventoryItem } from "@/composables/usePartyInventory";
import AppButton from "@/components/common/AppButton.vue";
import DashboardWidget from "../DashboardWidget.vue";

/** Loot the party is carrying that nobody has identified yet — a standing job
 *  for the DM rather than a thing happening at the table. */
const { data: party } = useParty();
const { data: inventory } = usePartyInventory();
const { mutateAsync: updateInventoryItem } = useUpdateInventoryItem();

const items = computed(() => {
  const memberNames = new Map((party.value ?? []).map((m) => [m.id, m.name]));
  return (inventory.value ?? [])
    .filter((i) => i.is_identified === false)
    .map((i) => ({ inv: i, carrier: i.carried_by ? (memberNames.get(i.carried_by) ?? null) : null }));
});

async function identify(invId: string) {
  await updateInventoryItem({ id: invId, update: { is_identified: true } });
}
</script>
