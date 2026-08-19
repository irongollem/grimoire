<template>
  <div class="mt-2 pt-2 border-t border-border/40">
    <div v-if="isPending" class="flex justify-center py-2">
      <LoadingSpinner class="h-4 w-4" />
    </div>
    <template v-else-if="item">
      <!-- Stat block -->
      <div
        class="rounded border bg-muted/20 p-2 mb-2 flex flex-col gap-1 text-xs"
        :style="{ borderColor: rarityTint }"
      >
        <div class="flex justify-between gap-2">
          <span class="text-muted-foreground shrink-0">Type</span>
          <span class="font-semibold text-foreground text-right">
            {{ ITEM_TYPE_LABELS[item.item_type] }}{{ item.subtype ? ` — ${item.subtype}` : '' }}
          </span>
        </div>
        <div class="flex justify-between gap-2">
          <span class="text-muted-foreground shrink-0">Rarity</span>
          <span class="font-semibold" :class="RARITY_TEXT[item.rarity]">
            {{ ITEM_RARITY_LABELS[item.rarity] }}
          </span>
        </div>
        <div v-if="item.weight || item.cost" class="flex justify-between gap-2">
          <span class="text-muted-foreground shrink-0">Weight / Cost</span>
          <span class="text-foreground text-right">
            {{ [item.weight, item.cost].filter(Boolean).join(' · ') }}
          </span>
        </div>
        <div v-if="item.requires_attunement" class="flex justify-between gap-2">
          <span class="text-muted-foreground shrink-0">Attunement</span>
          <span class="text-foreground text-right">
            {{ item.attunement_requirements || 'Required' }}
          </span>
        </div>
        <!-- Weapon damage -->
        <div v-if="item.damage_rolls?.length" class="flex justify-between gap-2">
          <span class="text-muted-foreground shrink-0">Damage</span>
          <span class="text-foreground text-right">
            {{ item.damage_rolls.map(d => `${d.dice} ${d.type}`).join(', ') }}
            <span v-if="item.versatile_damage"> / {{ item.versatile_damage }}</span>
          </span>
        </div>
        <!-- Armor class -->
        <div v-if="item.armor_class" class="flex justify-between gap-2">
          <span class="text-muted-foreground shrink-0">AC</span>
          <span class="text-foreground text-right">{{ item.armor_class }}</span>
        </div>
        <!-- Range -->
        <div v-if="item.weapon_range" class="flex justify-between gap-2">
          <span class="text-muted-foreground shrink-0">Range</span>
          <span class="text-foreground text-right">{{ item.weapon_range }}</span>
        </div>
        <!-- Charges -->
        <div v-if="item.charges" class="flex justify-between gap-2">
          <span class="text-muted-foreground shrink-0">Charges</span>
          <span class="text-foreground text-right">
            {{ item.charges }}{{ item.recharge ? ` (${item.recharge})` : '' }}
          </span>
        </div>
        <!-- Properties -->
        <div v-if="item.properties?.length" class="flex justify-between gap-2">
          <span class="text-muted-foreground shrink-0">Properties</span>
          <span class="text-foreground text-right capitalize">
            {{ item.properties.join(', ') }}
          </span>
        </div>
      </div>
      <!-- Description -->
      <div v-if="item.description" class="text-xs leading-snug">
        <RichTextViewer :content="item.description" />
      </div>
    </template>
    <!-- item is null only once both lookups miss: the base table (owner-only —
         always null for a player) and the player-visible projection (only
         populated once the drop is claimed into party_inventory, or the item
         sits in a shared, visible store). Same "unclaimed" placeholder either
         way — see the composed lookup below. -->
    <p v-else class="text-xs italic text-muted-foreground py-1">
      You don't know anything about this item yet — claim it to reveal its details.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useItem, usePlayerVisibleItems } from "@/composables/useItems";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import {
  ITEM_TYPE_LABELS,
  ITEM_RARITY_LABELS,
  RARITY_TEXT,
  RARITY_VAR,
} from "@/types/item.types";

const props = defineProps<{ itemId: string }>();

// Base-table lookup (owner RLS — resolves for the DM, always null for a
// player) combined with the player-visible projection (resolves once the
// drop lands in party_inventory or a shared, visible store — see
// get_player_visible_items, migration 20260711000014). No role branch is
// needed: exactly one side ever has data for a given viewer, and DM-preview
// is already handled inside usePlayerVisibleItems.
const { data: baseItem, isPending: baseItemPending } = useItem(props.itemId);
const { data: visibleItems, isLoading: visibleItemsLoading } = usePlayerVisibleItems();
const item = computed(() => baseItem.value ?? visibleItems.value?.find((i) => i.id === props.itemId) ?? null);
const isPending = computed(() => baseItemPending.value || visibleItemsLoading.value);

/** Border tint from the ramp token. `color-mix` rather than an appended hex
 *  alpha, which only worked while these were hex literals (#744). */
const rarityTint = computed(() =>
  item.value
    ? `color-mix(in oklab, ${RARITY_VAR[item.value.rarity]} 33%, transparent)`
    : "transparent",
);
</script>

<style scoped>
@reference "@/assets/main.css";

/* Scale down the RichTextViewer prose for chat context */
:deep(.rte-content .ProseMirror) {
  font-size: 0.6875rem;
  line-height: 1.5;
}
:deep(.rte-content .ProseMirror p) {
  margin-bottom: 0.4em;
}
:deep(.rte-content .ProseMirror h1),
:deep(.rte-content .ProseMirror h2),
:deep(.rte-content .ProseMirror h3) {
  font-size: 0.6875rem;
  margin-top: 0.4em;
  margin-bottom: 0.2em;
}
</style>
