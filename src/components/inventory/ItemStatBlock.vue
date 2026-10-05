<template>
  <div
    class="rounded-lg border bg-card p-3 flex flex-col gap-1.5 font-stat text-base"
    :style="isIdentified ? { borderColor: rarityTint } : {}"
  >
    <div v-if="displayItemTypeLabel && !omitSummaryRows" class="flex justify-between">
      <span class="text-muted-foreground">Type</span>
      <span class="font-bold">{{ displayItemTypeLabel }}</span>
    </div>
    <div v-if="item?.subtype && isIdentified" class="flex justify-between">
      <span class="text-muted-foreground">Subtype</span>
      <span>{{ item.subtype }}</span>
    </div>
    <div v-if="item && !omitSummaryRows" class="flex justify-between">
      <span class="text-muted-foreground">Rarity</span>
      <span
        class="font-bold"
        :class="isIdentified ? RARITY_TEXT[item.rarity] : RARITY_TEXT['mundane']"
      >
        {{ isIdentified ? ITEM_RARITY_LABELS[item.rarity] : ITEM_RARITY_LABELS['mundane'] }}
      </span>
    </div>
    <div v-if="item?.weight" class="flex justify-between">
      <span class="text-muted-foreground">Weight</span>
      <span>{{ item.weight }}</span>
    </div>
    <div v-if="item?.cost" class="flex justify-between">
      <span class="text-muted-foreground">Cost</span>
      <span>{{ item.cost }}</span>
    </div>
    <!-- Armor class -->
    <div v-if="item?.armor_class" class="flex justify-between">
      <span class="text-muted-foreground">Armor Class</span>
      <span class="font-bold">{{ item.armor_class }}</span>
    </div>
    <!-- Weapon damage -->
    <template v-if="item?.damage_rolls?.length">
      <div v-for="(roll, i) in item.damage_rolls" :key="i" class="flex justify-between">
        <span class="text-muted-foreground">{{ i === 0 ? 'Damage' : 'Alt. Damage' }}</span>
        <span class="font-bold capitalize">{{ roll.dice }} {{ roll.type }}</span>
      </div>
    </template>
    <div v-if="item?.versatile_damage && isIdentified" class="flex justify-between">
      <span class="text-muted-foreground">Versatile</span>
      <span>{{ item.versatile_damage }} (two-handed)</span>
    </div>
    <div v-if="item?.weapon_range" class="flex justify-between">
      <span class="text-muted-foreground">Range</span>
      <span>{{ item.weapon_range }}</span>
    </div>
    <!-- Properties (physical only when unidentified) -->
    <div v-if="item?.properties?.length" class="flex justify-between gap-3">
      <span class="text-muted-foreground shrink-0">Properties</span>
      <span class="text-right capitalize">{{ item.properties.join(", ") }}</span>
    </div>
    <!-- Weapon mastery — 2024 campaigns only (gate is internal to the badge) -->
    <WeaponMasteryBadge :mastery="item?.mastery" variant="row" />
    <div v-if="item?.is_arcane_focus && isIdentified" class="flex justify-between">
      <span class="text-muted-foreground">Arcane Focus</span>
      <span>Yes</span>
    </div>
    <div v-if="item?.requires_attunement && isIdentified && !omitSummaryRows" class="flex justify-between gap-4">
      <span class="text-muted-foreground shrink-0">Attunement</span>
      <span class="text-right">{{ item.attunement_requirements || "Required" }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  ITEM_RARITY_LABELS,
  RARITY_SURFACE_VAR,
  RARITY_TEXT,
} from "@/types/item.types";
import type { Item } from "@/types/item.types";
import { visibleTypeLabel } from "@/components/inventory/itemDetailSummary";
import WeaponMasteryBadge from "@/components/items/WeaponMasteryBadge.vue";

const { item, isIdentified, omitSummaryRows = false } = defineProps<{
  item: Item | null;
  isIdentified: boolean;
  /** Leave out type, rarity and attunement for a host that already says them in its own summary line. */
  omitSummaryRows?: boolean;
}>();

/** Border tint from the ramp token. `color-mix` rather than an appended hex
 *  alpha, which only worked while these were hex literals (#744). */
const rarityTint = computed(() =>
  item ? `color-mix(in oklab, ${RARITY_SURFACE_VAR[item.rarity]} 40%, transparent)` : "transparent"
);

const displayItemTypeLabel = computed(() => visibleTypeLabel(item, isIdentified));
</script>
