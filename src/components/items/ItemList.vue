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
    >
      <template #icon><IconNavItemVault class="h-16 w-16" /></template>
    </EmptyState>

    <!-- Grid -->
    <div
      v-else
      class="grid gap-3"
      style="grid-template-columns: repeat(auto-fill, minmax(11.25rem, 1fr))"
    >
      <!--
        An item card is deliberately the leanest of the entity cards: the name
        rides the artwork in `#image-footer`, and the body carries only a quick
        stat line and tags. Items have far less to say at a glance than an NPC
        or a monster, and filling the body to match them would be padding.
      -->
      <EntityGridCard
        v-for="item in visibleItems"
        :key="item.id"
        :to="`/vault/${item.id}`"
        :title="item.name"
        :image-url="item.image_url"
        :focal-point="item.image_focal_point"
        placeholder="/assets/placeholders/item.webp"
        :badge-text="ITEM_RARITY_LABELS[item.rarity]"
        :badge-class="RARITY_BG[item.rarity]"
      >
        <!-- Owned rows get Edit; shared rows say so and link through to the
             detail view's Clone action, which is the only way to change them. -->
        <template #actions-start>
          <AppButton
            v-if="isUuid(item.id)"
            :to="`/vault/${item.id}?edit=true`"
            variant="ghost"
            size="xs"
            :icon="IconEdit"
            label="Edit"
            :class="[
              CARD_OVERLAY_SCRIM,
              'text-white hover:text-white max-md:min-h-11 max-md:px-3',
              '[@media(hover:hover)]:opacity-0 transition-opacity group-hover:opacity-100',
            ]"
            tooltip="Edit item"
          />
          <span
            v-else
            class="flex h-6 items-center rounded bg-black/50 px-1.5 text-label text-white backdrop-blur-sm"
          >Reference</span>
        </template>

        <template #image-footer>
          <div class="flex items-end gap-1.5">
            <component
              :is="itemTypeIcon(item.item_type)"
              class="mb-px h-3.5 w-3.5 shrink-0 text-white/70"
            />
            <IconFeather
              v-if="item.content !== null"
              class="mb-px h-3.5 w-3.5 shrink-0 text-white/70"
            />
            <span
              class="line-clamp-2 font-cinzel text-sm font-bold leading-tight text-white transition-colors group-hover:text-primary/90"
            >
              {{ item.name }}
            </span>
          </div>
        </template>

        <template #body>
          <!-- Damage / AC quick stat -->
          <div
            v-if="item.damage_rolls?.length || item.armor_class || item.charges"
            class="mt-auto flex items-center gap-3 pt-1"
          >
            <span v-if="item.damage_rolls?.length" class="text-caption text-muted-foreground">
              ⚔
              {{
                item.damage_rolls
                  .map((r) => r.dice + (r.type ? " " + r.type : ""))
                  .join(" + ")
              }}
            </span>
            <span v-if="item.armor_class" class="text-caption text-muted-foreground">
              🛡 AC {{ item.armor_class }}
            </span>
            <span v-if="item.charges" class="text-caption text-muted-foreground">
              ✦ {{ item.charges }} charges
            </span>
          </div>

          <div v-if="item.tags.length" class="flex flex-wrap gap-1">
            <span
              v-for="tag in item.tags.slice(0, 4)"
              :key="tag"
              class="rounded bg-muted px-1 py-1 text-label text-muted-foreground"
            >
              {{ tag }}
            </span>
          </div>
        </template>
      </EntityGridCard>
    </div>
    <div ref="sentinelRef" />
  </div>
</template>

<script setup lang="ts">
import { computed, type Component as VueComponent } from "vue";
import { IconCaravan, IconCircle, IconCoins, IconComponent, IconEdit, IconFeather, IconFood, IconGem, IconGenerate, IconInventory, IconInvite, IconLightning, IconNavItemVault, IconPackage, IconPotion, IconScrollText, IconShield, IconSword, IconTool, IconWand } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import { CARD_OVERLAY_SCRIM } from "@/components/common/appButtonVariants";
import EntityGridCard from "@/components/common/EntityGridCard.vue";
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
import { useScrollRestore } from "@/composables/useScrollRestore";
import { useItems } from "@/composables/useItems";
import { isUuid } from "@/lib/library/contentIdentity";
import { ITEM_RARITY_LABELS, RARITY_BG } from "@/types/item.types";
import EmptyState from "@/components/common/EmptyState.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";

const props = defineProps<{
  search: string;
  typeFilter: string;
  rarityFilter: string;
  sourceFilter: string;
  showAllScopes?: boolean;
}>();

const { data: items, isLoading } = useItems(() => ({ includeAllScopes: !!props.showAllScopes }));

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

const { savedCount, linkCount } = useScrollRestore("items");
const { visibleItems, sentinelRef, visibleCount } = useInfiniteScroll(filtered, 48, savedCount);
linkCount(visibleCount);

</script>
