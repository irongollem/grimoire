<template>
  <div class="flex flex-col gap-2" data-testid="species-yields">
    <ul v-if="mine.length > 0" class="m-0 flex list-none flex-col gap-1 p-0">
      <li v-for="y in mine" :key="y.id" class="flex min-w-0 items-baseline gap-2" data-testid="species-yield">
        <span class="min-w-0 text-body">{{ nameOf(y) }}</span>
        <span v-if="y.note" class="min-w-0 text-caption italic text-muted-foreground">{{ y.note }}</span>
        <AppButton class="ml-auto" variant="ghost" size="icon-sm" :icon="IconClose" :aria-label="`Remove ${nameOf(y)}`" data-testid="remove-yield" @click="removeYield(y.id)" />
      </li>
    </ul>
    <p v-else class="m-0 text-caption text-muted-foreground">Nothing yet. What a hunter, a gatherer or a cook gets from this species.</p>
    <div class="flex flex-wrap items-center gap-2">
      <EntityCombobox v-model="pick" :options="options" placeholder="Add an item…" @open="itemsWanted = true" />
      <AppInput v-model="note" tone="filled" size="sm" class="min-w-[min(100%,10rem)] flex-1" maxlength="120" placeholder="A note, if any" aria-label="A note on what it yields" />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * What a species yields (#1283): items from the campaign's own and the enabled books' items, each with an optional note
 * given when it is added. The item index is read when the picker is first opened. A species yields an item once.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { useSpeciesEditing } from "@/composables/canon/useCampaignSpecies";
import { useItemIndex } from "@/composables/items/useItemIndex";
import type { Species, SpeciesYield } from "@/lib/canon/ecologyTypes";
import { IconClose } from "@/lib/icons";

const { species } = defineProps<{ species: Species }>();
const { yields, addYield, removeYield } = useSpeciesEditing();

const mine = computed(() => yields.value.filter((y) => y.speciesId === species.id).sort((a, b) => a.sortOrder - b.sortOrder));

// Read at once: the rows name their items, so the index is wanted as soon as there is a row to name.
const itemsWanted = ref(false);
const { data: index } = useItemIndex(() => ({ enabled: itemsWanted.value || mine.value.length > 0 }));
const nameById = computed(() => new Map((index.value ?? []).map((i) => [i.id, i.name])));
// An item the index does not hold (gone, or not this reader's) is named "???", as an unreadable mention is.
const nameOf = (y: SpeciesYield): string => {
  const id = y.itemId !== null ? y.itemId : y.libraryItemId;
  const name = id === null ? undefined : nameById.value.get(id);
  return name === undefined ? "???" : name;
};

const options = computed(() => {
  const taken = new Set(mine.value.flatMap((y) => [y.itemId, y.libraryItemId]));
  return (index.value ?? []).filter((i) => !taken.has(i.id));
});

// An add-picker: it adds the item and empties itself, so it is local state, not a list filter.
const pick = ref("");
const note = ref("");
watch(pick, async (id) => {
  if (!id) return;
  const entry = index.value?.find((i) => i.id === id);
  pick.value = "";
  if (!entry) return;
  const trimmed = note.value.trim();
  const made = await addYield(species.id, {
    itemId: entry.is_shared ? null : entry.id,
    libraryItemId: entry.is_shared ? entry.id : null,
    note: trimmed === "" ? null : trimmed,
  });
  if (made !== null) note.value = "";
});
</script>
