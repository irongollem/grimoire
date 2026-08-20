<template>
  <Transition name="fade">
    <div
      v-if="slot"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      @click.self="emit('close')"
    >
      <div class="bg-card border border-border rounded-xl shadow-xl p-5 w-80 max-h-[80vh] overflow-y-auto space-y-3">
        <p class="font-cinzel text-sm font-semibold text-foreground tracking-wider capitalize">
          {{ slotLabel }} Slot
        </p>

        <!-- Currently equipped in this slot -->
        <div
          v-if="slotItem"
          class="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 flex items-center justify-between gap-2"
        >
          <span class="text-body text-foreground flex-1 min-w-0 truncate">{{ slotItem.name }}</span>
          <button
            class="shrink-0 font-cinzel text-2xs text-destructive hover:opacity-70"
            @click="emit('unequip')"
          >
            Remove
          </button>
        </div>
        <p v-else class="text-caption text-muted-foreground italic">
          Nothing equipped here.
        </p>

        <!-- Items that can go in this slot (owned, not equipped elsewhere) -->
        <div v-if="candidates.length">
          <p class="font-cinzel text-2xs text-muted-foreground tracking-widest uppercase mb-1.5">
            Equip from inventory
          </p>
          <AppButton
            v-for="item in candidates"
            :key="item.id"
            variant="menu"
            size="body"
            block
            :label="item.name"
            @click="emit('equip', item)"
          />
        </div>
        <p v-else class="text-caption text-muted-foreground italic">
          No items available to equip here.
        </p>

        <AppButton
          variant="ghost"
          size="inline"
          block
          class="mt-1"
          label="Close"
          @click="emit('close')"
        />
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import type { PartyInventoryItem, InventorySlot } from "@/types/inventory.types";

const { slot, slotItem, candidates } = defineProps<{
  slot: InventorySlot | null;
  slotItem: PartyInventoryItem | null;
  candidates: PartyInventoryItem[];
}>();

const emit = defineEmits<{
  equip: [item: PartyInventoryItem];
  unequip: [];
  close: [];
}>();

const SLOT_LABELS: Record<InventorySlot, string> = {
  head: "Head",
  neck: "Neck",
  shoulders: "Shoulders",
  body: "Body",
  clothes: "Clothes",
  hands: "Gloves",
  ring: "Ring",
  waist: "Waist",
  feet: "Boots",
  main_hand: "Main Hand",
  off_hand: "Off Hand",
  other: "Other",
};

const slotLabel = computed(() => (slot ? SLOT_LABELS[slot] : ""));
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
