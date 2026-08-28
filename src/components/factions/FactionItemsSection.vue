<template>
  <EntityLinkSection
    v-model="newItemId"
    :entries="entries ?? []"
    :options="availableItems"
    heading="Associated Items"
    placeholder="Add item…"
    :adding="adding"
    remove-label="item"
    @add="add"
    @remove="remove"
  >
    <template #entry="{ entry }">
      <IconPackage class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <RouterLink
        :to="`/vault/${entry.item.id}`"
        class="font-cinzel text-xs font-semibold text-foreground hover:text-primary transition-colors flex-1 truncate"
      >
        {{ entry.item.name }}
      </RouterLink>
      <span class="text-label text-muted-foreground shrink-0 capitalize">{{ entry.item.rarity }}</span>
    </template>
  </EntityLinkSection>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { IconPackage } from "@/lib/icons";
import {
  useFactionItems,
  useAddFactionItem,
  useRemoveFactionItem,
  type FactionItemWithItem,
} from "@/composables/factions/useFactions";
import { useItems, useEnsureOwnedItem } from "@/composables/items/useItems";
import EntityLinkSection from "@/components/common/EntityLinkSection.vue";

const props = defineProps<{ factionId: string }>();

const { data: entries }  = useFactionItems(props.factionId);
const { data: allItems } = useItems();
const { ensureOwnedItem } = useEnsureOwnedItem();
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
  const picked = availableItems.value.find((i) => i.id === newItemId.value);
  if (!picked) return;
  adding.value = true;
  try {
    // Library items are shared rows; linking one has to mint the DM's own copy first.
    const owned = await ensureOwnedItem(picked);
    await addMut.mutateAsync({ faction_id: props.factionId, item_id: owned.id });
    newItemId.value = "";
  } finally {
    adding.value = false;
  }
}

async function remove(e: FactionItemWithItem) {
  await removeMut.mutateAsync({ id: e.id, faction_id: e.faction_id });
}
</script>
