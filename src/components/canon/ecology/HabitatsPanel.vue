<template>
  <div class="flex flex-col gap-3" data-testid="habitats">
    <ul v-if="habitats.length > 0" class="flex flex-col border border-border bg-card" data-testid="habitat-list">
      <HabitatRow
        v-for="(habitat, index) in habitats"
        :key="habitat.id"
        :habitat="habitat"
        :places="placeNames(habitat.id)"
        :summary="summaryOf(habitat.id)"
        :selected="habitat.id === selectedId"
        :first="index === 0"
        :last="index === habitats.length - 1"
        @select="selectedId = habitat.id"
        @move="(by) => move(index, by)"
      />
    </ul>
    <EmptyState
      v-else-if="!isLoading"
      class="border border-dashed border-border bg-card"
      title="No kinds of country yet"
      description="A habitat is a kind of country, a marsh or a high moor, with the places it covers and the creatures that live there. Name one to begin."
    />
    <CanonAddRow placeholder="A new kind of country…" input-label="A new kind of country" label="Add habitat" :create="add" />
    <HabitatEditor v-if="selected" :key="selected.id" :habitat="selected" @delete="onDelete" />
  </div>
</template>

<script setup lang="ts">
/**
 * The habitats of the world (#1255 item 31): a list, one line each with the places it covers and what lives there, and
 * the selected one's editor below it. Order is the DM's and is kept; the world block lists them in it.
 */
import { computed, ref } from "vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import CanonAddRow from "../CanonAddRow.vue";
import HabitatEditor from "./HabitatEditor.vue";
import HabitatRow from "./HabitatRow.vue";
import { useHabitatEditing } from "@/composables/canon/useCampaignHabitats";
import { useLocationTree } from "@/composables/locations/useLocations";
import { sharesLine } from "@edge-shared/worldBlock.ts";

const { habitats, places, life, isLoading, addHabitat, reorderHabitats } = useHabitatEditing();
const { locationOptions } = useLocationTree();

const selectedId = ref<string | null>(null);
const selected = computed(() => habitats.value.find((h) => h.id === selectedId.value) ?? null);

const nameOfPlace = computed(() => new Map(locationOptions.value.map((l) => [l.id, l.name])));
const placeNames = (habitatId: string): string[] =>
  places.value.filter((p) => p.habitatId === habitatId).flatMap((p) => nameOfPlace.value.get(p.locationId) ?? []);
const summaryOf = (habitatId: string): string => sharesLine(life.value.filter((l) => l.habitatId === habitatId), "anything else");

async function add(name: string): Promise<void> {
  const id = await addHabitat(name);
  // The mutation has told the DM when it failed; throwing keeps the words in the box to try again.
  if (id === null) throw new Error("The habitat was not added.");
  selectedId.value = id;
}

function move(index: number, by: -1 | 1) {
  const ids = habitats.value.map((h) => h.id);
  const [moved] = ids.splice(index, 1);
  ids.splice(index + by, 0, moved);
  reorderHabitats(ids);
}

function onDelete() {
  selectedId.value = null;
}
</script>
