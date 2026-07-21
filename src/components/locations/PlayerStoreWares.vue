<template>
  <div>
    <div v-if="isLoading" class="text-caption text-muted-foreground italic">Loading…</div>
    <div v-else-if="items?.length" class="flex flex-col gap-1">
      <button
        v-for="si in items"
        :key="si.id"
        type="button"
        class="flex items-center gap-2 rounded border border-border bg-muted/30 px-3 py-2 text-left hover:bg-muted/60 hover:border-primary/40 transition-colors w-full"
        @click="selected = si"
      >
        <div class="flex-1 min-w-0">
          <p class="font-cinzel text-xs font-semibold text-foreground truncate">{{ si.item.name }}</p>
          <p class="text-caption-sm text-muted-foreground italic">{{ ITEM_TYPE_LABELS[si.item.item_type] }}</p>
        </div>
        <span class="text-caption text-muted-foreground shrink-0">
          {{ si.price_override ?? si.item.cost ?? '—' }}
        </span>
        <IconChevronRight class="h-3 w-3 text-muted-foreground shrink-0" />
      </button>
    </div>
    <p v-else class="text-caption text-muted-foreground italic">Nothing for sale yet.</p>
  </div>

  <!-- Item detail modal -->
  <Teleport to="body">
    <div
      v-if="selected"
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      @click.self="selected = null"
      @keydown.escape="selected = null"
    >
      <div class="w-full sm:max-w-2xl bg-card border border-border rounded-t-2xl sm:rounded-xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
        <!-- Header -->
        <div class="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
          <h2 class="font-cinzel text-sm font-semibold text-foreground flex-1 truncate">
            {{ selected.item.name }}
          </h2>
          <span class="text-caption text-muted-foreground shrink-0">
            {{ selected.price_override ?? selected.item.cost ?? '—' }}
          </span>
          <button
            type="button"
            class="text-muted-foreground hover:text-foreground transition-colors ml-1 shrink-0"
            @click="selected = null"
          >
            <IconClose class="h-4 w-4" />
          </button>
        </div>
        <!-- Scrollable item sheet -->
        <div class="flex-1 overflow-y-auto px-4 py-4">
          <ItemSheet :item="selected.item" :player-view="true" :price-override="selected.price_override" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconChevronRight, IconClose } from '@/lib/icons';
import { useSharedStoreItems } from "@/composables/useStoreItems";
import type { StoreItem } from "@/composables/useStoreItems";
import { ITEM_TYPE_LABELS } from "@/types/item.types";
import ItemSheet from "@/components/items/ItemSheet.vue";

const props = defineProps<{ locationId: string }>();

const locationIdRef = computed(() => props.locationId);
const { data: items, isLoading } = useSharedStoreItems(locationIdRef);

const selected = ref<StoreItem | null>(null);
</script>
