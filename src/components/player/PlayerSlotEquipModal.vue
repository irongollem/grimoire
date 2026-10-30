<template>
  <!-- On AppModal rather than a fixed overlay drawn in place: drawn in place it
       sat inside the player layout's scrolling <main>, so on a phone a swipe
       over the list scrolled the page behind it instead of the list. -->
  <AppModal :open="!!slot" size="sm" align="sheet" @close="emit('close')">
    <ModalHeader :title="`${slotLabel} Slot`" closeable @close="emit('close')" />

    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 pb-5">
      <!-- Currently equipped in this slot -->
      <div
        v-if="slotItem"
        class="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 flex items-center justify-between gap-2"
      >
        <span class="text-body text-foreground flex-1 min-w-0 truncate">{{ slotItem.name }}</span>
        <AppButton variant="link" tone="danger" size="inline" class="shrink-0" label="Remove" @click="emit('unequip')" />
      </div>
      <p v-else class="text-caption text-muted-foreground italic">
        Nothing equipped here.
      </p>

      <!-- Items that can go in this slot (owned, not equipped elsewhere) -->
      <div v-if="candidates.length">
        <p class="text-eyebrow text-muted-foreground mb-1.5">
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
    </div>
  </AppModal>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
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

