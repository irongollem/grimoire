<template>
  <div>
    <div v-if="isLoading" class="text-caption text-muted-foreground italic">Loading…</div>
    <div v-else-if="items?.length" class="flex flex-col gap-1">
      <AppButton
        v-for="si in items"
        :key="si.id"
        variant="outline"
        size="body"
        surface="muted"
        block
        :disabled="!si.item"
        class="justify-start text-left gap-2"
        @click="selectItem(si)"
      >
        <div class="flex-1 min-w-0">
          <p class="font-cinzel text-xs font-semibold text-foreground truncate">
            {{ si.item?.name ?? 'Unknown item' }}
          </p>
          <p class="text-caption-sm text-muted-foreground italic">
            {{ si.item ? ITEM_TYPE_LABELS[si.item.item_type] : 'not yet revealed' }}
          </p>
        </div>
        <span class="text-caption text-muted-foreground shrink-0">
          {{ si.price_override ?? si.item?.cost ?? '—' }}
        </span>
        <IconChevronRight v-if="si.item" class="h-3 w-3 text-muted-foreground shrink-0" />
      </AppButton>
    </div>
    <p v-else class="text-caption text-muted-foreground italic">Nothing for sale yet.</p>
  </div>

  <!-- Item detail modal -->
  <AppModal :open="!!selected" size="lg" align="sheet" @close="selected = null">
    <template v-if="selected">
      <ModalHeader :title="selected.item.name" closeable @close="selected = null">
        <template #actions>
          <span class="text-caption text-muted-foreground shrink-0">
            {{ selected.price_override ?? selected.item.cost ?? '—' }}
          </span>
        </template>
      </ModalHeader>
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <ItemSheet :item="selected.item" :player-view="true" :price-override="selected.price_override" />
      </div>
    </template>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconChevronRight } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import AppModal from "@/components/common/AppModal.vue";
import ModalHeader from "@/components/common/ModalHeader.vue";
import { useSharedStoreItems } from "@/composables/items/useStoreItems";
import type { PlayerStoreItem } from "@/composables/items/useStoreItems";
import { ITEM_TYPE_LABELS } from "@/types/item.types";
import type { Item } from "@/types/item.types";
import ItemSheet from "@/components/items/ItemSheet.vue";

const props = defineProps<{ locationId: string }>();

const locationIdRef = computed(() => props.locationId);
const { data: items, isLoading } = useSharedStoreItems(locationIdRef);

/** Narrowed once a row is confirmed to have a resolved item — see the
 *  projection-lag note on {@link useSharedStoreItems}. Rows whose item hasn't
 *  resolved yet are rendered disabled and never reach here. */
type SelectedStoreItem = PlayerStoreItem & { item: Item };

const selected = ref<SelectedStoreItem | null>(null);

function selectItem(si: PlayerStoreItem) {
  if (!si.item) return;
  selected.value = si as SelectedStoreItem;
}
</script>
