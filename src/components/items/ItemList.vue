<template>
  <div class="flex flex-col gap-4">
    <!-- Loading: the same auto-fill grid and EntityGridCard shape as the loaded
         list, so the cards do not jump when they land. -->
    <ListSkeleton v-if="isLoading" variant="grid" columns="fill" :count="12" />

    <EmptyState
      v-else-if="error"
      title="Could not load items"
      description="Something went wrong fetching the vault. Try again in a moment."
    >
      <template #icon><IconNavItemVault class="h-16 w-16" /></template>
    </EmptyState>

    <!-- Empty state -->
    <EmptyState
      v-else-if="!rows.length"
      title="No items found"
      :description="
        search || typeFilter || rarityFilter || sourceFilter || scopeFilter
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

        Wrapped in BulkSelectableCard (#875) for every card — but `selecting`
        is only ever true for the DM's own rows (`isUuid`); a library/reference
        row always gets `selecting: false` regardless of the list-wide mode, so
        it renders untouched and cannot be selected or re-scoped.
      -->
      <!-- `contents` keeps the grid layout as if this wrapper were absent. It
           exists to hear pointer/focus for the detail prefetch: EntityGridCard
           opens with a comment, so listeners passed to it do not fall through. -->
      <div
        v-for="item in rows"
        :key="item.id"
        class="contents"
        @pointerover="prefetchDetail(item.id)"
        @focusin="prefetchDetail(item.id)"
      >
      <BulkSelectableCard
        :selected="selectedIds.has(item.id)"
        :selecting="selecting && !item.is_shared"
        @toggle="emit('toggle-select', item.id)"
      >
        <EntityGridCard
          :to="`/vault/${item.id}`"
          :title="item.name"
          :image-url="item.image_url"
          :focal-point="item.image_focal_point"
          :placeholder="placeholderUrl('item')"
          :badge-text="ITEM_RARITY_LABELS[item.rarity]"
          :badge-class="RARITY_BG[item.rarity]"
        >
          <!-- Owned rows get Edit; shared rows say so and link through to the
               detail view's Clone action, which is the only way to change them. -->
          <template #actions-start>
            <AppButton
              v-if="!item.is_shared && !selecting"
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
            <!-- Library rows only: an owned row in select mode shows nothing
                 here, leaving this corner to BulkSelectableCard's checkbox.
                 A plain v-else labelled the DM's own items "Reference" the
                 moment select mode hid their Edit button. -->
            <span
              v-else-if="item.is_shared"
              class="flex h-6 items-center rounded bg-black/50 px-1.5 text-label text-white backdrop-blur-sm"
            >Reference</span>
          </template>

          <template #image-footer>
            <div class="flex items-end gap-1.5">
              <component
                :is="itemTypeIcon(item.item_type)"
                class="mb-px h-3.5 w-3.5 shrink-0 text-white/70"
              />
              <IconDocument
                v-if="item.has_content"
                class="mb-px h-3.5 w-3.5 shrink-0 text-white/70"
              />
              <span
                class="line-clamp-2 text-heading-xs font-bold leading-tight text-white transition-colors group-hover:text-primary/90"
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
      </BulkSelectableCard>
      </div>
    </div>
    <div ref="sentinelRef" />
  </div>
</template>

<script setup lang="ts">
import { type Component as VueComponent } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import { IconCaravan, IconCircle, IconCoins, IconComponent, IconDocument, IconEdit, IconFood, IconGem, IconGenerate, IconInventory, IconInvite, IconLightning, IconNavItemVault, IconPackage, IconPotion, IconScrollText, IconShield, IconSword, IconTool, IconWand } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import { CARD_OVERLAY_SCRIM } from "@/components/common/appButtonVariants";
import EntityGridCard from "@/components/common/EntityGridCard.vue";
import BulkSelectableCard from "@/components/common/BulkSelectableCard.vue";
import type { ItemType } from "@/types/item.types";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";

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
import { useServerInfiniteScroll } from "@/composables/useServerInfiniteScroll";
import { useItemBrowse } from "@/composables/items/useItemBrowse";
import { fetchResolvedItem, resolvedItemKey } from "@/composables/items/useItems";
import type { ItemScope } from "@/lib/items/itemScope";
import { ITEM_RARITY_LABELS, RARITY_BG } from "@/types/item.types";
import EmptyState from "@/components/common/EmptyState.vue";
import ListSkeleton from "@/components/common/ListSkeleton.vue";

const {
  search,
  typeFilter,
  rarityFilter,
  sourceFilter,
  scopeFilter,
  selecting = false,
  selectedIds = new Set<string>(),
} = defineProps<{
  search: string;
  typeFilter: string;
  rarityFilter: string;
  sourceFilter: string;
  /** One `itemScopeOf` classification to show, or "" for everything usable
   *  in the active campaign (see `useUiStore`'s `vaultFilterScope`). */
  scopeFilter: ItemScope | "";
  /** Bulk-selection mode is on (#875). Library/reference rows (non-UUID ids)
   *  never enter selection mode regardless of this flag — see the template. */
  selecting?: boolean;
  selectedIds?: ReadonlySet<string>;
}>();

/** A hover-prefetched detail stays fresh this long, so skimming a grid does not refetch it. */
const DETAIL_PREFETCH_STALE_MS = 30_000;

const emit = defineEmits<{ "toggle-select": [id: string] }>();

const queryClient = useQueryClient();
const {
  rows,
  selectableIds,
  sources,
  ready,
  isLoading,
  error,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
} = useItemBrowse(() => ({
  search,
  type: typeFilter,
  rarity: rarityFilter,
  source: sourceFilter,
  scope: scopeFilter,
}));

/**
 * `selectableIds` is every own row matching the filters (server-side, whichever
 * page it is on), so "Select all shown" never pre-ticks a library/reference row
 * and never misses one that has not scrolled in yet. `ready` is false while the
 * first page of the current filters is still loading, so the view does not prune
 * a selection against an empty stand-in.
 */
defineExpose({ selectableIds, sources, ready });

// Warm the detail route's cache before the click lands (#972).
function prefetchDetail(id: string) {
  void queryClient.prefetchQuery({
    queryKey: resolvedItemKey(id),
    queryFn: () => fetchResolvedItem(id),
    staleTime: DETAIL_PREFETCH_STALE_MS,
  });
}

// The sentinel asks for the next server page; scroll depth is restored on return
// from a detail.
const { sentinelRef } = useServerInfiniteScroll({
  scrollKey: "items",
  loadedCount: () => rows.value.length,
  ready, hasNextPage, isFetchingNextPage, fetchNextPage,
});
</script>
