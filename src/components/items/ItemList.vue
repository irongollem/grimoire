<template>
  <div class="flex flex-col gap-4">
    <!-- Filters row -->
    <div class="flex items-center gap-3 flex-wrap">
      <input
        v-model="search"
        placeholder="Search items…"
        class="bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring flex-1 min-w-40"
      />
      <select
        v-model="typeFilter"
        class="bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All types</option>
        <option v-for="t in ITEM_TYPES" :key="t" :value="t">{{ ITEM_TYPE_LABELS[t] }}</option>
      </select>
      <select
        v-model="rarityFilter"
        class="bg-muted border border-border rounded-md px-2 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All rarities</option>
        <option v-for="r in ITEM_RARITIES" :key="r" :value="r">{{ ITEM_RARITY_LABELS[r] }}</option>
      </select>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="flex justify-center py-12">
      <LoadingSpinner />
    </div>

    <!-- Empty state -->
    <EmptyState
      v-else-if="!filtered.length"
      title="No items found"
      :description="search || typeFilter || rarityFilter ? 'Try adjusting your filters.' : 'Add your first item to the vault.'"
    />

    <!-- Grid -->
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      <div
        v-for="item in filtered"
        :key="item.id"
        class="group relative rounded-lg border border-border bg-card hover:border-primary/50 transition-colors flex flex-col"
      >
        <!-- Card link overlay -->
        <RouterLink :to="`/vault/${item.id}`" class="absolute inset-0 z-2" />

        <div class="p-4 flex flex-col gap-2 flex-1">
          <!-- Name + rarity badge -->
          <div class="flex items-start justify-between gap-2">
            <span class="font-cinzel text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
              {{ item.name }}
            </span>
            <span
              class="font-cinzel text-[10px] tracking-wider px-1.5 py-0.5 rounded shrink-0"
              :style="{ backgroundColor: rarityColor(item.rarity) + '33', color: rarityColor(item.rarity) }"
            >
              {{ ITEM_RARITY_LABELS[item.rarity] }}
            </span>
          </div>

          <!-- Type line -->
          <p class="font-fell text-xs text-muted-foreground capitalize">
            {{ ITEM_TYPE_LABELS[item.item_type] }}
            <span v-if="item.subtype">· {{ item.subtype }}</span>
            <span v-if="item.requires_attunement"> · Attunement</span>
          </p>

          <!-- Damage / AC quick stat -->
          <div class="flex items-center gap-3 mt-auto pt-1">
            <span v-if="item.damage_rolls?.length" class="font-fell text-xs text-muted-foreground">
              ⚔ {{ item.damage_rolls.map(r => r.dice + (r.type ? ' ' + r.type : '')).join(' + ') }}
            </span>
            <span v-if="item.armor_class" class="font-fell text-xs text-muted-foreground">
              🛡 AC {{ item.armor_class }}
            </span>
            <span v-if="item.charges" class="font-fell text-xs text-muted-foreground">
              ✦ {{ item.charges }} charges
            </span>
          </div>

          <!-- Tags -->
          <div v-if="item.tags.length" class="flex gap-1 flex-wrap">
            <span
              v-for="tag in item.tags.slice(0, 4)"
              :key="tag"
              class="font-cinzel text-[10px] tracking-wider text-muted-foreground bg-muted px-1.5 py-0.5 rounded"
            >
              {{ tag }}
            </span>
          </div>
        </div>

        <!-- Edit button (floats top-left on hover) -->
        <RouterLink
          :to="`/vault/${item.id}?edit=true`"
          class="absolute top-2 left-2 z-10 flex items-center gap-1 rounded px-2 py-1 font-cinzel text-[10px] font-semibold tracking-wider text-white bg-black/50 hover:bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Edit item"
        >
          <Pencil class="h-3 w-3" />
          Edit
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Pencil } from "lucide-vue-next";
import { useItems } from "@/composables/useItems";
import {
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  ITEM_RARITIES,
  ITEM_RARITY_LABELS,
  RARITY_BADGE_COLORS,
} from "@/types/item.types";
import type { ItemRarity } from "@/types/item.types";
import EmptyState from "@/components/common/EmptyState.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";

const { data: items, isLoading } = useItems();

const search = ref("");
const typeFilter = ref("");
const rarityFilter = ref("");

const filtered = computed(() => {
  const q = search.value.toLowerCase();
  return (items.value ?? []).filter((item) => {
    if (typeFilter.value && item.item_type !== typeFilter.value) return false;
    if (rarityFilter.value && item.rarity !== rarityFilter.value) return false;
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

function rarityColor(rarity: ItemRarity): string {
  return RARITY_BADGE_COLORS[rarity] ?? "#9ca3af";
}
</script>
