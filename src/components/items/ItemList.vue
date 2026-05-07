<template>
  <div class="flex flex-col gap-4">
    <!-- Loading -->
    <div v-if="isLoading" class="flex justify-center py-12">
      <LoadingSpinner />
    </div>

    <!-- Empty state -->
    <EmptyState
      v-else-if="!filtered.length"
      title="No items found"
      :description="
        search || typeFilter || rarityFilter
          ? 'Try adjusting your filters.'
          : 'Add your first item to the vault.'
      "
    />

    <!-- Grid -->
    <div
      v-else
      class="grid gap-3"
      style="grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))"
    >
      <div
        v-for="item in visibleItems"
        :key="item.id"
        class="group relative rounded-lg border border-border bg-card hover:border-primary/50 transition-colors flex flex-col"
      >
        <!-- Card link overlay -->
        <RouterLink :to="`/vault/${item.id}`" class="absolute inset-0 z-2" />

        <!-- Thumbnail with overlays -->
        <div
          class="relative h-36 bg-muted overflow-hidden shrink-0 rounded-t-lg"
        >
          <FocalImage
            v-if="item.image_url"
            :src="item.image_url"
            :alt="item.name"
            format="landscape"
            :focal-point="item.image_focal_point"
            class="group-hover:scale-105 transition-transform duration-300"
          />
          <!-- Rarity badge — top right -->
          <span
            class="absolute top-1.5 right-1.5 font-cinzel text-[9px] tracking-wider px-1.5 py-0.5 rounded leading-none"
            :style="{
              backgroundColor: rarityColor(item.rarity) + 'cc',
              color: '#fff',
            }"
          >
            {{ ITEM_RARITY_LABELS[item.rarity] }}
          </span>
          <!-- Type icon + name — bottom gradient -->
          <div
            class="absolute bottom-0 left-0 right-0 px-2.5 py-2 bg-linear-to-t from-black/75 to-transparent flex items-end gap-1.5"
          >
            <component
              :is="itemTypeIcon(item.item_type)"
              class="h-3.5 w-3.5 shrink-0 text-white/70 mb-px"
            />
            <span
              class="font-cinzel text-sm font-bold text-white group-hover:text-primary/90 transition-colors leading-tight line-clamp-2"
            >
              {{ item.name }}
            </span>
          </div>
        </div>

        <div class="px-3 py-2 flex flex-col gap-1.5 flex-1">
          <!-- Damage / AC quick stat -->
          <div
            v-if="item.damage_rolls?.length || item.armor_class || item.charges"
            class="flex items-center gap-3 mt-auto pt-1"
          >
            <span
              v-if="item.damage_rolls?.length"
              class="font-fell text-xs text-muted-foreground"
            >
              ⚔
              {{
                item.damage_rolls
                  .map((r) => r.dice + (r.type ? " " + r.type : ""))
                  .join(" + ")
              }}
            </span>
            <span
              v-if="item.armor_class"
              class="font-fell text-xs text-muted-foreground"
            >
              🛡 AC {{ item.armor_class }}
            </span>
            <span
              v-if="item.charges"
              class="font-fell text-xs text-muted-foreground"
            >
              ✦ {{ item.charges }} charges
            </span>
          </div>

          <!-- Tags -->
          <div v-if="item.tags.length" class="flex gap-1 flex-wrap">
            <span
              v-for="tag in item.tags.slice(0, 4)"
              :key="tag"
              class="font-cinzel text-[10px] tracking-wider text-muted-foreground bg-muted px-1 py-1 rounded"
            >
              {{ tag }}
            </span>
          </div>
        </div>

        <!-- Edit button (floats top-left on hover) -->
        <RouterLink
          :to="`/vault/${item.id}?edit=true`"
          class="absolute top-2 left-2 z-10 flex items-center gap-1 rounded px-2 py-1 font-cinzel text-[10px] font-semibold tracking-wider text-white bg-black/50 hover:bg-black/70 [@media(hover:hover)]:opacity-0 group-hover:opacity-100 transition-opacity"
          title="Edit item"
        >
          <IconEdit class="h-3 w-3" />
          Edit
        </RouterLink>
      </div>
    </div>
    <div ref="sentinelRef" />
  </div>
</template>

<script setup lang="ts">
import { computed, type Component as VueComponent } from "vue";
import { IconCaravan, IconCircle, IconCoins, IconComponent, IconEdit, IconFood, IconGem, IconGenerate, IconInventory, IconInvite, IconLightning, IconPackage, IconPotion, IconScrollText, IconShield, IconSword, IconTool, IconWand } from '@/lib/icons';
import FocalImage from "@/components/common/FocalImage.vue";
import type { ItemType } from "@/types/item.types";

const ITEM_TYPE_ICONS: Record<ItemType, VueComponent> = {
  weapon: IconSword,
  armor: IconShield,
  shield: IconShield,
  potion: IconPotion,
  wondrous_item: IconGenerate,
  ring: IconCircle,
  rod: IconWand,
  staff: IconWand,
  wand: IconWand,
  scroll: IconScrollText,
  ammunition: IconLightning,
  gear: IconInventory,
  tool: IconTool,
  vehicle: IconCaravan,
  trade_good: IconCoins,
  crafting_material: IconGem,
  provision: IconFood,
  art_object: IconGem,
  service: IconInvite,
  pack: IconPackage,
};

function itemTypeIcon(type: ItemType): VueComponent {
  return ITEM_TYPE_ICONS[type] ?? IconComponent;
}
import { useInfiniteScroll } from "@/composables/useInfiniteScroll";
import { useItems } from "@/composables/useItems";
import { ITEM_RARITY_LABELS, RARITY_BADGE_COLORS } from "@/types/item.types";
import type { ItemRarity } from "@/types/item.types";
import EmptyState from "@/components/common/EmptyState.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";

const props = defineProps<{
  search: string;
  typeFilter: string;
  rarityFilter: string;
  sourceFilter: string;
}>();

const { data: items, isLoading } = useItems();

const filtered = computed(() => {
  const q = props.search.trim().toLowerCase();
  return (items.value ?? []).filter((item) => {
    if (props.typeFilter && item.item_type !== props.typeFilter) return false;
    if (props.rarityFilter && item.rarity !== props.rarityFilter) return false;
    if (props.sourceFilter && item.source !== props.sourceFilter) return false;
    if (q) {
      return (
        item.name.toLowerCase().includes(q) ||
        (item.subtype ?? "").toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    return true;
  });
});

const { visibleItems, sentinelRef } = useInfiniteScroll(filtered);

function rarityColor(rarity: ItemRarity): string {
  return RARITY_BADGE_COLORS[rarity] ?? "#9ca3af";
}
</script>
