<template>
  <div class="flex flex-col gap-3">
    <h2 class="text-label-lg font-semibold text-muted-foreground uppercase">Associated Items</h2>

    <div v-if="entries?.length" class="flex flex-col gap-1.5">
      <div
        v-for="e in entries"
        :key="e.id"
        class="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2"
      >
        <IconPackage class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <RouterLink :to="`/vault/${e.item.id}`" class="font-cinzel text-xs font-semibold text-foreground hover:text-primary transition-colors flex-1 truncate">
          {{ e.item.name }}
        </RouterLink>
        <span class="text-label text-muted-foreground shrink-0 capitalize">{{ e.item.rarity }}</span>
        <button type="button" class="shrink-0 text-muted-foreground hover:text-destructive transition-colors text-base leading-none" @click="remove(e)">×</button>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <EntityCombobox v-model="newItemId" :options="availableItems" placeholder="Add item…" />
      <button
        type="button"
        :disabled="!newItemId || adding"
        class="shrink-0 inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 font-cinzel text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="add"
      >
        <IconAdd class="h-3 w-3" />
        Add
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconAdd, IconPackage } from '@/lib/icons';
import {
  useFactionItems,
  useAddFactionItem,
  useRemoveFactionItem,
  type FactionItemWithItem,
} from "@/composables/useFactions";
import { useItems } from "@/composables/useItems";
import EntityCombobox from "@/components/common/EntityCombobox.vue";

const props = defineProps<{ factionId: string }>();

const { data: entries }  = useFactionItems(props.factionId);
const { data: allItems } = useItems();
const addMut    = useAddFactionItem();
const removeMut = useRemoveFactionItem();

const linkedIds = computed(() => new Set((entries.value ?? []).map((e) => e.item_id)));
const availableItems = computed(() =>
  (allItems.value ?? []).filter((i) => !linkedIds.value.has(i.id)),
);

const newItemId = ref("");
const adding    = ref(false);

async function add() {
  if (!newItemId.value) return;
  adding.value = true;
  try {
    await addMut.mutateAsync({ faction_id: props.factionId, item_id: newItemId.value });
    newItemId.value = "";
  } finally {
    adding.value = false;
  }
}

async function remove(e: FactionItemWithItem) {
  await removeMut.mutateAsync({ id: e.id, faction_id: e.faction_id });
}
</script>
