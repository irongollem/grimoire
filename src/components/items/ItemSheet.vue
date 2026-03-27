<template>
  <div class="flex flex-col gap-6">
    <div class="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
      <!-- Left: image -->
      <div class="flex flex-col gap-3 lg:sticky lg:top-6">
        <FocalImage
          v-if="item.image_url"
          :src="item.image_url"
          :focal-point="item.image_focal_point"
          format="portrait"
          class="w-full rounded-lg overflow-hidden flex-1 min-h-0 max-h-[75vh]"
        />
        <!-- Rarity badge -->
        <div
          class="rounded-lg border bg-card p-3 flex flex-col gap-1.5 font-stat text-[15px]"
          :style="{ borderColor: rarityColor + '66' }"
        >
          <div class="flex justify-between">
            <span class="text-muted-foreground">Type</span>
            <span class="font-bold">{{
              ITEM_TYPE_LABELS[item.item_type]
            }}</span>
          </div>
          <div v-if="item.subtype" class="flex justify-between">
            <span class="text-muted-foreground">Subtype</span>
            <span class="font-bold">{{ item.subtype }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">Rarity</span>
            <span
              class="font-bold"
              :style="{ color: RARITY_BADGE_COLORS[item.rarity] }"
              >{{ ITEM_RARITY_LABELS[item.rarity] }}</span
            >
          </div>
          <div v-if="item.weight" class="flex justify-between">
            <span class="text-muted-foreground">Weight</span>
            <span>{{ item.weight }}</span>
          </div>
          <div v-if="item.cost" class="flex justify-between">
            <span class="text-muted-foreground">Cost</span>
            <span>{{ item.cost }}</span>
          </div>
        </div>
        <div v-if="item.tags?.length" class="flex flex-wrap gap-1">
          <span
            v-for="tag in item.tags"
            :key="tag"
            class="font-cinzel text-[10px] tracking-wider bg-muted text-muted-foreground rounded px-2 py-0.5"
            >{{ tag }}</span
          >
        </div>
      </div>

      <!-- Right: details -->
      <div class="flex flex-col gap-4">
        <!-- Attunement -->
        <div
          v-if="item.requires_attunement"
          class="font-stat text-[15px] text-primary italic"
        >
          Requires attunement<span v-if="item.attunement_requirements">
            {{ item.attunement_requirements }}</span
          >
        </div>

        <!-- Weapon stats -->
        <div
          v-if="item.damage_rolls?.length"
          class="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-1"
        >
          <h3
            class="font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
          >
            Damage
          </h3>
          <p class="font-stat text-[15px]">
            {{
              item.damage_rolls.map((r) => `${r.dice} ${r.type}`).join(" + ")
            }}
          </p>
          <p
            v-if="item.properties?.length"
            class="font-stat text-[13px] text-muted-foreground capitalize"
          >
            {{ item.properties.join(", ") }}
          </p>
        </div>

        <!-- Armor -->
        <div
          v-if="item.armor_class"
          class="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-1"
        >
          <h3
            class="font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
          >
            Armor Class
          </h3>
          <p class="font-stat text-[15px]">{{ item.armor_class }}</p>
        </div>

        <!-- Charges -->
        <div
          v-if="item.charges"
          class="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-1"
        >
          <h3
            class="font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
          >
            Charges
          </h3>
          <p class="font-stat text-[15px]">
            {{ item.charges }} charges<span v-if="item.recharge">
              · {{ item.recharge }}</span
            >
          </p>
        </div>

        <!-- Description -->
        <div class="flex flex-col gap-1">
          <h3
            class="font-cinzel text-xs font-bold tracking-wider text-primary uppercase"
          >
            Description
          </h3>
          <RichTextViewer :content="item.description" />
        </div>

        <div
          v-if="item.source"
          class="font-stat text-[13px] text-muted-foreground italic"
        >
          {{ item.source }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import {
  ITEM_TYPE_LABELS,
  ITEM_RARITY_LABELS,
  RARITY_COLORS,
  RARITY_BADGE_COLORS,
} from "@/types/item.types";
import type { Item } from "@/types/item.types";

const props = defineProps<{ item: Item }>();

const rarityColor = computed(
  () => RARITY_COLORS[props.item.rarity] ?? "#888888",
);
</script>
