<template>
  <div
    class="rounded-lg border bg-card p-3 flex flex-col gap-1.5 font-stat text-base"
    :style="isIdentified ? { borderColor: rarityColor + '66' } : {}"
  >
    <div v-if="displayItemTypeLabel" class="flex justify-between">
      <span class="text-muted-foreground">Type</span>
      <span class="font-bold">{{ displayItemTypeLabel }}</span>
    </div>
    <div v-if="item?.subtype && isIdentified" class="flex justify-between">
      <span class="text-muted-foreground">Subtype</span>
      <span>{{ item.subtype }}</span>
    </div>
    <div v-if="item" class="flex justify-between">
      <span class="text-muted-foreground">Rarity</span>
      <span
        class="font-bold"
        :style="isIdentified ? { color: RARITY_BADGE_COLORS[item.rarity] } : { color: RARITY_BADGE_COLORS['mundane'] }"
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
    <div v-if="item?.is_arcane_focus && isIdentified" class="flex justify-between">
      <span class="text-muted-foreground">Arcane Focus</span>
      <span>Yes</span>
    </div>
    <div v-if="item?.requires_attunement && isIdentified" class="flex justify-between gap-4">
      <span class="text-muted-foreground shrink-0">Attunement</span>
      <span class="text-right">{{ item.attunement_requirements || "Required" }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  ITEM_TYPE_LABELS,
  ITEM_RARITY_LABELS,
  RARITY_COLORS,
  RARITY_BADGE_COLORS,
  MAGIC_ONLY_ITEM_TYPES,
} from "@/types/item.types";
import type { Item } from "@/types/item.types";

const { item, isIdentified } = defineProps<{
  item: Item | null;
  isIdentified: boolean;
}>();

const rarityColor = computed(() =>
  item ? (RARITY_COLORS[item.rarity] ?? "#888888") : "#888888"
);

const displayItemTypeLabel = computed(() => {
  if (!item) return !isIdentified ? ITEM_TYPE_LABELS['art_object'] : null;
  const shouldMask = !isIdentified && item.rarity !== 'mundane';
  if (shouldMask && item.item_type === 'potion') return ITEM_TYPE_LABELS['provision'];
  if (shouldMask && MAGIC_ONLY_ITEM_TYPES.has(item.item_type)) return ITEM_TYPE_LABELS['art_object'];
  return ITEM_TYPE_LABELS[item.item_type];
});
</script>
