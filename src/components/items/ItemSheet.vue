<template>
  <div class="flex flex-col gap-6">
    <div class="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
      <!-- Left: image -->
      <div class="flex flex-col gap-3 lg:sticky lg:top-6">
        <div v-if="item.image_url" class="w-full rounded-lg overflow-hidden" style="aspect-ratio: 2/3; max-height: 75vh">
          <FocalImage
            :src="item.image_url"
            :focal-point="item.image_focal_point"
            format="portrait"
            class="h-full"
          />
        </div>
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
          v-if="item.damage_rolls?.length || item.weapon_range"
          class="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-1"
        >
          <h3
            class="font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
          >
            Weapon
          </h3>
          <p v-if="item.damage_rolls?.length" class="font-stat text-[15px]">
            {{
              item.damage_rolls.map((r) => `${r.dice} ${r.type}`).join(" + ")
            }}<span v-if="item.versatile_damage" class="text-muted-foreground"> ({{ item.versatile_damage }} two-handed)</span>
          </p>
          <p v-if="item.weapon_range" class="font-stat text-[14px] text-muted-foreground">
            Range: {{ item.weapon_range }}
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

        <!-- Charges / Quantity -->
        <div
          v-if="item.charges"
          class="rounded-lg border border-border bg-card/50 p-3 flex flex-col gap-1"
        >
          <h3
            class="font-cinzel text-[10px] font-bold tracking-wider text-muted-foreground uppercase"
          >
            {{ item.item_type === "ammunition" ? "Quantity" : "Charges" }}
          </h3>
          <p class="font-stat text-[15px]">
            {{ item.charges }}<span v-if="item.item_type !== 'ammunition'"> charges</span><span v-if="item.recharge">
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

        <!-- Curse (DM always sees it; badge shows player visibility) -->
        <div
          v-if="item.curse_description"
          class="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex flex-col gap-3"
        >
          <div class="flex items-center justify-between gap-2">
            <h3 class="font-cinzel text-xs font-bold tracking-wider text-destructive uppercase">
              Curse
            </h3>
            <button
              type="button"
              :disabled="isTogglingReveal"
              class="inline-flex items-center gap-1.5 rounded px-2 py-1 font-cinzel text-[10px] font-semibold tracking-wider border transition-colors disabled:opacity-50"
              :class="item.curse_revealed
                ? 'border-amber-500/50 text-amber-500 hover:bg-amber-500/10'
                : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'"
              @click="toggleReveal"
            >
              <Eye v-if="item.curse_revealed" class="h-3 w-3" />
              <EyeOff v-else class="h-3 w-3" />
              {{ item.curse_revealed ? 'Revealed to players' : 'Hidden from players' }}
            </button>
          </div>
          <RichTextViewer :content="item.curse_description" />
        </div>

        <div
          v-if="item.source"
          class="font-stat text-[13px] text-muted-foreground italic"
        >
          <a
            v-if="item.source_url"
            :href="item.source_url"
            target="_blank"
            rel="noopener noreferrer"
            class="hover:text-foreground hover:underline transition-colors"
          >{{ itemSourceLabel(item.source, item.source_title) }}</a>
          <span v-else>{{ itemSourceLabel(item.source, item.source_title) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Eye, EyeOff } from "lucide-vue-next";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import { useUpdateItem } from "@/composables/useItems";
import {
  ITEM_TYPE_LABELS,
  ITEM_RARITY_LABELS,
  RARITY_COLORS,
  RARITY_BADGE_COLORS,
  itemSourceLabel,
} from "@/types/item.types";
import type { Item } from "@/types/item.types";

const props = defineProps<{ item: Item }>();

const rarityColor = computed(
  () => RARITY_COLORS[props.item.rarity] ?? "#888888",
);

const { mutateAsync: updateItem } = useUpdateItem();
const isTogglingReveal = ref(false);

async function toggleReveal() {
  isTogglingReveal.value = true;
  try {
    await updateItem({ id: props.item.id, update: { curse_revealed: !props.item.curse_revealed } });
  } finally {
    isTogglingReveal.value = false;
  }
}
</script>
