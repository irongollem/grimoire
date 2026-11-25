<template>
  <div class="flex flex-col gap-2" data-testid="people-places">
    <ul v-if="mine.length > 0" class="m-0 flex list-none flex-wrap gap-2 p-0">
      <li v-for="place in mine" :key="place.id" class="flex items-center gap-1 rounded-lg border border-border bg-muted/40 py-0.5 pr-0.5 pl-2" data-testid="people-place-chip">
        <span class="text-body text-foreground">{{ nameOf(place.locationId) }}</span>
        <AppButton variant="ghost" size="icon-xs" :icon="IconClose" :aria-label="`${people.name} no longer live in ${nameOf(place.locationId)}`" @click="removePlace(place.id)" />
      </li>
    </ul>
    <p v-else class="m-0 text-caption text-muted-foreground">No place yet. Several peoples may live in one place.</p>
    <EntityCombobox v-model="pick" :options="offered" placeholder="Add a place…">
      <template #option="{ opt }">
        <span :style="{ paddingLeft: `${opt.depth * 0.75}rem` }">{{ opt.name }}</span>
      </template>
    </EntityCombobox>
  </div>
</template>

<script setup lang="ts">
/** The Atlas places a people lives in (#1279 item 22). Unlike a habitat, a place may hold several peoples, so the picker leaves out only this people's own. */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { usePeoplesEditing } from "@/composables/canon/useCampaignPeoples";
import { useLocationTree } from "@/composables/locations/useLocations";
import { IconClose } from "@/lib/icons";
import type { People } from "@/lib/canon/peoples";

const { people } = defineProps<{ people: People }>();
const { places, addPlace, removePlace } = usePeoplesEditing();
const { locationOptions } = useLocationTree();

const nameOf = (locationId: string): string => locationOptions.value.find((l) => l.id === locationId)?.name ?? "A place that is gone";
const mine = computed(() => places.value.filter((p) => p.peopleId === people.id));
const here = computed(() => new Set(mine.value.map((p) => p.locationId)));
const offered = computed(() => locationOptions.value.filter((l) => !here.value.has(l.id)));

// An add-picker: it empties itself on pick, so it is local state, not a list filter.
const pick = ref("");
watch(pick, (id) => {
  if (!id) return;
  addPlace(people.id, id);
  pick.value = "";
});
</script>
