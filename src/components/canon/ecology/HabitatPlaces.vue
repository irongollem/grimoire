<template>
  <div class="flex flex-col gap-2" data-testid="habitat-places">
    <ul v-if="mine.length > 0" class="m-0 flex list-none flex-wrap gap-2 p-0">
      <li v-for="place in mine" :key="place.id" class="flex items-center gap-1 rounded-lg border border-border bg-muted/40 py-0.5 pr-0.5 pl-2" data-testid="habitat-place-chip">
        <span class="text-body text-foreground">{{ nameOf(place.locationId) }}</span>
        <AppButton variant="ghost" size="icon-xs" :icon="IconClose" :aria-label="`Stop covering ${nameOf(place.locationId)}`" @click="removePlace(place.id)" />
      </li>
    </ul>
    <p v-else class="m-0 text-caption text-muted-foreground">No place yet. A place covers the places inside it too, unless one of those is another habitat's.</p>
    <EntityCombobox v-model="pick" :options="offered" placeholder="Add a place…">
      <template #option="{ opt }">
        <span :style="{ paddingLeft: `${opt.depth * 0.75}rem` }">{{ opt.name }}</span>
      </template>
    </EntityCombobox>
    <p v-if="elsewhere.length > 0" class="m-0 text-caption text-muted-foreground" data-testid="habitat-places-elsewhere">
      Already in another habitat: {{ elsewhere.join(", ") }}.
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * The Atlas places a habitat covers. A place lies in at most one habitat (the table's own rule), so the picker leaves out
 * every place already placed, and a line says which habitat holds the ones left out.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { useHabitatEditing } from "@/composables/canon/useCampaignHabitats";
import { useLocationTree } from "@/composables/locations/useLocations";
import { IconClose } from "@/lib/icons";
import type { Habitat } from "@/lib/canon/habitats";

const { habitat } = defineProps<{ habitat: Habitat }>();
const { habitats, places, addPlace, removePlace } = useHabitatEditing();
const { locationOptions } = useLocationTree();

const nameOf = (locationId: string): string => locationOptions.value.find((l) => l.id === locationId)?.name ?? "A place that is gone";
const mine = computed(() => places.value.filter((p) => p.habitatId === habitat.id));
const placed = computed(() => new Set(places.value.map((p) => p.locationId)));
const offered = computed(() => locationOptions.value.filter((l) => !placed.value.has(l.id)));
const elsewhere = computed(() =>
  places.value
    .filter((p) => p.habitatId !== habitat.id)
    .map((p) => `${nameOf(p.locationId)} (${habitats.value.find((h) => h.id === p.habitatId)?.name ?? "a habitat"})`),
);

// An add-picker: it empties itself on pick, so it is local state, not a list filter.
const pick = ref("");
watch(pick, (id) => {
  if (!id) return;
  addPlace(habitat.id, id);
  pick.value = "";
});
</script>
