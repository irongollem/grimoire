<template>
  <div class="space-y-4">
    <h2 class="font-cinzel text-xl font-bold text-foreground">Party Inventory</h2>

    <div v-if="isLoading" class="flex justify-center py-12">
      <LoadingSpinner />
    </div>

    <div v-else-if="!items?.length" class="text-center py-12">
      <Package class="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
      <p class="font-fell text-muted-foreground italic">The party carries nothing yet.</p>
    </div>

    <div v-else class="rounded-lg border border-border bg-card overflow-hidden">
      <table class="w-full">
        <thead>
          <tr class="border-b border-border bg-muted/20">
            <th class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider text-left px-4 py-2">Item</th>
            <th class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider text-center px-3 py-2">Qty</th>
            <th class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider text-left px-3 py-2 hidden sm:table-cell">Carried By</th>
            <th class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider text-center px-3 py-2 hidden sm:table-cell">Attuned</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-border">
          <tr v-for="item in items" :key="item.id" class="hover:bg-muted/20 transition-colors">
            <td class="px-4 py-3">
              <p class="font-fell text-sm text-foreground">{{ item.name }}</p>
              <p v-if="item.notes" class="font-fell text-xs text-muted-foreground italic mt-0.5">{{ item.notes }}</p>
            </td>
            <td class="px-3 py-3 text-center">
              <span class="font-cinzel text-sm font-semibold text-foreground">{{ item.quantity }}</span>
            </td>
            <td class="px-3 py-3 hidden sm:table-cell">
              <span class="font-fell text-sm text-muted-foreground">
                {{ carrierName(item.carried_by) ?? '—' }}
              </span>
            </td>
            <td class="px-3 py-3 text-center hidden sm:table-cell">
              <span v-if="item.is_attuned" class="inline-flex h-4 w-4 rounded-full bg-primary/20 border border-primary/40 mx-auto" />
              <span v-else class="font-fell text-xs text-muted-foreground/40">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Package } from "lucide-vue-next";
import { usePartyInventory } from "@/composables/usePartyInventory";
import { useParty } from "@/composables/useParty";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";

const { data: items, isLoading } = usePartyInventory();
const { data: partyMembers } = useParty();

function carrierName(id: string | null): string | null {
  if (!id || !partyMembers.value) return null;
  return partyMembers.value.find((m) => m.id === id)?.name ?? null;
}
</script>
