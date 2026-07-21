<template>
  <div class="rounded-lg border border-border bg-card p-4">
    <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider mb-3">
      Equipped
    </p>
    <div class="flex gap-4">
      <!-- Silhouette -->
      <div class="relative shrink-0 w-32 h-60 select-none">
        <img
          :src="slotItem('clothes') ? '/assets/dressed.webp' : '/assets/naked.webp'"
          alt="Character"
          class="w-full h-full object-contain object-center transition-opacity duration-200"
        />

        <!-- Slot buttons overlaid on silhouette -->
        <!-- HEAD -->
        <SlotButton
          style="top: 0px; left: 50%; transform: translateX(-50%)"
          :item="slotItem('head')"
          :disabled="!slotItem('head') && !canEquipSlot('head')"
          label="Head"
          @click="$emit('open-slot', 'head')"
        />
        <!-- NECK -->
        <SlotButton
          style="top: 2.125rem; left: 50%; transform: translateX(-50%)"
          :item="slotItem('neck')"
          :disabled="!slotItem('neck') && !canEquipSlot('neck')"
          label="Neck"
          @click="$emit('open-slot', 'neck')"
        />
        <!-- SHOULDERS -->
        <SlotButton
          style="top: 2.5rem; left: -0.625rem"
          :item="slotItem('shoulders')"
          :disabled="!slotItem('shoulders') && !canEquipSlot('shoulders')"
          label="Shldr"
          @click="$emit('open-slot', 'shoulders')"
        />
        <!-- BODY -->
        <SlotButton
          style="top: 4.125rem; left: 50%; transform: translateX(-50%)"
          :item="slotItem('body')"
          :disabled="!slotItem('body') && !canEquipSlot('body')"
          label="Body"
          @click="$emit('open-slot', 'body')"
        />
        <!-- HANDS -->
        <SlotButton
          style="top: 7.25rem; right: -0.625rem"
          :item="slotItem('hands')"
          :disabled="!slotItem('hands') && !canEquipSlot('hands')"
          label="Gloves"
          @click="$emit('open-slot', 'hands')"
        />
        <!-- RING (left) -->
        <SlotButton
          style="top: 8.25rem; left: -0.75rem"
          :item="slotItem('ring')"
          :disabled="!slotItem('ring') && !canEquipSlot('ring')"
          label="Ring"
          @click="$emit('open-slot', 'ring')"
        />
        <!-- WAIST -->
        <SlotButton
          style="top: 6.625rem; left: 50%; transform: translateX(-50%)"
          :item="slotItem('waist')"
          :disabled="!slotItem('waist') && !canEquipSlot('waist')"
          label="Waist"
          @click="$emit('open-slot', 'waist')"
        />
        <!-- CLOTHES (legs) -->
        <SlotButton
          style="top: 9.25rem; right: -0.625rem"
          :item="slotItem('clothes')"
          :warn="!slotItem('clothes') && canEquipSlot('clothes')"
          :disabled="!slotItem('clothes') && !canEquipSlot('clothes')"
          label="Clothes"
          @click="$emit('open-slot', 'clothes')"
        />
        <!-- FEET -->
        <SlotButton
          style="bottom: 0.125rem; left: 50%; transform: translateX(-50%)"
          :item="slotItem('feet')"
          :disabled="!slotItem('feet') && !canEquipSlot('feet')"
          label="Boots"
          @click="$emit('open-slot', 'feet')"
        />
      </div>

      <!-- Weapon slots + other -->
      <div class="flex-1 min-w-0 flex flex-col justify-between">
        <div class="space-y-1.5">
          <p class="font-cinzel text-2xs md:text-sm text-muted-foreground/60 tracking-widest uppercase">
            Weapons
          </p>
          <EquipSlotRow
            :item="slotItem('main_hand')"
            label="Main hand"
            @click="$emit('open-slot', 'main_hand')"
          />
          <EquipSlotRow
            :item="slotItem('off_hand')"
            label="Off hand"
            @click="$emit('open-slot', 'off_hand')"
          />
        </div>
        <div class="space-y-1.5 mt-3">
          <p class="font-cinzel text-2xs md:text-sm text-muted-foreground/60 tracking-widest uppercase">
            Other
          </p>
          <EquipSlotRow
            v-for="item in otherEquipped"
            :key="item.id"
            :item="item"
            :label="item.name"
            @click="$emit('open-detail', item)"
          />
          <EquipSlotRow
            v-if="!otherEquipped.length"
            :item="null"
            label="Other"
            @click="$emit('open-slot', 'other')"
          />
        </div>
      </div>
    </div>

    <!-- Attunement slots -->
    <div v-if="hasMember" class="mt-2 flex items-center justify-between gap-2">
      <span class="font-cinzel text-2xs md:text-sm text-muted-foreground/50 tracking-wider">ATTUNEMENT</span>
      <div class="flex items-center gap-1.5">
        <div
          v-for="n in 3"
          :key="n"
          class="h-2 w-2 rounded-full border transition-colors"
          :class="
            n <= attunedItems.length
              ? 'bg-primary border-primary'
              : 'bg-muted border-border'
          "
          :title="n <= attunedItems.length ? attunedItems[n - 1]?.name : 'Empty slot'"
        />
        <span class="font-cinzel text-2xs md:text-sm text-muted-foreground/50">{{ attunedItems.length }}/3</span>
      </div>
    </div>

    <!-- Equipped weight -->
    <p
      v-if="hasMember && equippedWeight > 0"
      class="font-cinzel text-2xs md:text-sm text-muted-foreground/50 tracking-wider text-right"
    >
      Equipped: {{ formatWeightLb(equippedWeight) }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { formatWeightLb } from '@/lib/utils';
import type { PartyInventoryItem, InventorySlot } from '@/types/inventory.types';
import SlotButton from '@/components/inventory/SlotButton.vue';
import EquipSlotRow from '@/components/inventory/EquipSlotRow.vue';

const {
  equippedItems,
  otherEquipped,
  attunedItems,
  equippedWeight,
  hasMember,
  canEquipSlot,
} = defineProps<{
  equippedItems: PartyInventoryItem[];
  otherEquipped: PartyInventoryItem[];
  attunedItems: PartyInventoryItem[];
  equippedWeight: number;
  hasMember: boolean;
  canEquipSlot: (slot: InventorySlot) => boolean;
}>();

defineEmits<{
  'open-slot': [slot: InventorySlot];
  'open-detail': [item: PartyInventoryItem];
}>();

function slotItem(slot: InventorySlot): PartyInventoryItem | null {
  return equippedItems.find((i) => i.slot === slot) ?? null;
}
</script>
