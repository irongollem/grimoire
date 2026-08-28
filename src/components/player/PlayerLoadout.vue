<template>
  <div class="rounded-lg border border-border bg-card px-4 py-3 space-y-2">
    <div class="flex items-center justify-between">
      <span class="text-label-lg font-semibold text-muted-foreground">LOADOUT</span>
      <RouterLink
        to="/play/inventory"
        class="flex items-center gap-1 text-label text-primary hover:opacity-80 transition-opacity"
      >
        <IconInventory class="h-3 w-3" />
        Manage
      </RouterLink>
    </div>

    <div v-if="equippedBySlot.length" class="flex flex-wrap gap-1.5">
      <span
        v-for="entry in equippedBySlot"
        :key="entry.inv.id"
        class="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 pl-2 pr-1 py-0.5 max-w-full"
        :title="`${entry.inv.name} — ${SLOT_LABELS[entry.slot] ?? entry.slot}`"
      >
        <span class="text-eyebrow text-muted-foreground shrink-0">{{ SLOT_LABELS[entry.slot] ?? entry.slot }}</span>
        <span class="text-caption text-foreground truncate">{{ entry.inv.name }}</span>
        <span
          v-if="(entry.inv.quantity ?? 1) > 1"
          class="font-cinzel text-2xs text-muted-foreground shrink-0"
        >×{{ entry.inv.quantity }}</span>
        <AppButton
          variant="ghost"
          tone="danger"
          fill="tone"
          size="icon-2xs"
          icon-size="xs"
          class="shrink-0 text-muted-foreground/60"
          :icon="IconClose"
          tooltip="Unequip"
          :disabled="isUnequipping"
          @click="unequip(entry.inv)"
        />
      </span>
    </div>
    <p v-else class="text-caption text-muted-foreground italic">
      Nothing equipped. <RouterLink to="/play/inventory" class="text-primary hover:opacity-80">Equip items in inventory →</RouterLink>
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import { IconClose, IconInventory } from '@/lib/icons';
import { usePartyInventory, useUpdateInventoryItem } from "@/composables/items/usePartyInventory";
import type { PartyInventoryItem, InventorySlot } from "@/types/inventory.types";

const props = defineProps<{ memberId: string }>();

const { data: inventory } = usePartyInventory();
const { mutateAsync: updateItem, isPending: isUnequipping } = useUpdateInventoryItem();

/**
 * Short labels for each slot. Kept compact so the chip row doesn't wrap
 * awkwardly on mobile. "main" / "off" chosen over MH/OH since those can
 * read as keyboard shortcuts.
 */
const SLOT_LABELS: Record<InventorySlot, string> = {
  head: "HEAD",
  neck: "NECK",
  shoulders: "SHL",
  body: "BODY",
  clothes: "WORN",
  hands: "HAND",
  ring: "RING",
  waist: "BELT",
  feet: "FEET",
  main_hand: "MAIN",
  off_hand: "OFF",
  other: "MISC",
};

/**
 * Priority order for slot rendering — head-to-toe for armor, then weapons,
 * then accessories. Unknown slots fall to the end.
 */
const SLOT_ORDER: InventorySlot[] = [
  "head", "neck", "shoulders", "body", "clothes",
  "hands", "ring", "waist", "feet",
  "main_hand", "off_hand", "other",
];

const equippedBySlot = computed(() => {
  const mine = (inventory.value ?? []).filter(
    (i) => i.carried_by === props.memberId && i.location === "equipped",
  );
  const orderIdx = (slot: InventorySlot | null) =>
    slot ? SLOT_ORDER.indexOf(slot) : 999;
  return mine
    .filter((i) => i.slot !== null)
    .sort((a, b) => orderIdx(a.slot) - orderIdx(b.slot))
    .map((inv) => ({ inv, slot: inv.slot as InventorySlot }));
});

async function unequip(inv: PartyInventoryItem) {
  // Move back to the backpack. Slot is cleared (required for non-equipped rows).
  await updateItem({
    id: inv.id,
    update: { location: "backpack", slot: null, is_equipped: false },
  });
}
</script>
