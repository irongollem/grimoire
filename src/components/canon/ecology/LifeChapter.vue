<template>
  <CanonChapter chapter="life" :title="chapter.label" :why="chapter.why" :open="selected !== null" back-label="habitats" @close="selectedId = null">
    <ul v-if="habitats.length > 0" class="flex flex-col rounded-lg border border-border bg-card" data-testid="habitat-list">
      <CanonRow
        v-for="(habitat, index) in habitats"
        :id="`canon-habitat-${habitat.id}`"
        :key="habitat.id"
        :title="habitat.name"
        strong
        :selected="habitat.id === selectedId"
        :move="{ first: index === 0, last: index === habitats.length - 1 }"
        @select="selectedId = habitat.id"
        @move="(by) => move(index, by)"
      >
        <span v-for="place in placeNames(habitat.id)" :key="place" class="mr-2 text-label text-muted-foreground" data-testid="habitat-place">{{ place }}</span>
        <span v-if="summaryOf(habitat.id)" class="mt-1 block text-caption text-muted-foreground" data-testid="habitat-summary">{{ summaryOf(habitat.id) }}</span>
        <span v-else class="mt-1 block text-caption italic text-muted-foreground">Nothing lives here yet.</span>
        <template #mark>
          <span class="inline-flex items-center gap-1.5 whitespace-nowrap text-label font-bold text-foreground" data-testid="habitat-mark">
            <IconLocation class="size-3.5 shrink-0" aria-hidden="true" />
            {{ placeNames(habitat.id).length === 0 ? "No places" : placeNames(habitat.id).length === 1 ? "1 place" : `${placeNames(habitat.id).length} places` }}
          </span>
        </template>
      </CanonRow>
    </ul>
    <!-- No Familiar here: the canon helper has no habitats mode, so a request would come back as truths. -->
    <CanonEmpty v-else-if="!isLoading" title="Nothing lives here yet" :text="EMPTY_TEXT" />

    <template #add>
      <CanonAddRow placeholder="A new kind of country…" input-label="A new kind of country" label="Add habitat" :create="add" />
    </template>

    <template #entry>
      <HabitatEditor v-if="selected" :key="selected.id" :habitat="selected" @close="selectedId = null" @delete="selectedId = null" />
    </template>
  </CanonChapter>
</template>

<script setup lang="ts">
/**
 * The Habitats chapter (#1255 item 31): the world's habitats, kinds of country, one line each with the places it covers and
 * what lives there at its worked-out shares, and the open one beside the list. Only species live here: the world's peoples are their own
 * chapter and are never listed or edited from a habitat. Order is the DM's and is kept; the world block lists them in it.
 */
import { computed, ref } from "vue";
import CanonAddRow from "../CanonAddRow.vue";
import CanonChapter from "../kit/CanonChapter.vue";
import CanonEmpty from "../kit/CanonEmpty.vue";
import CanonRow from "../kit/CanonRow.vue";
import HabitatEditor from "./HabitatEditor.vue";
import { useLinkedRow } from "@/composables/canon/useLinkedRow";
import { useHabitatEditing } from "@/composables/canon/useCampaignHabitats";
import { useLocationTree } from "@/composables/locations/useLocations";
import { IconLocation } from "@/lib/icons";
import { chapterOf } from "@/lib/canon/canonParts";
import { useCampaignSpecies } from "@/composables/canon/useCampaignSpecies";
import { habitatSummary } from "@/lib/canon/habitatRows";

// Not the chapter's own line again: what one habitat is, so the DM knows what to add.
const EMPTY_TEXT = "A habitat is a kind of country: a marsh, a deep forest, the high ice. Name one, choose the places it covers and what lives there, and how common each is.";
const chapter = chapterOf("life");

const { habitats, places, habitatSpecies, life, isLoading, addHabitat, reorderHabitats } = useHabitatEditing();
const { species, forms } = useCampaignSpecies();
const { locationOptions } = useLocationTree();

const selectedId = ref<string | null>(null);
const selected = computed(() => habitats.value.find((h) => h.id === selectedId.value) ?? null);
// A search hit lands here as `?habitat=<id>`: open that habitat and bring its row into view; an unknown id opens nothing.
useLinkedRow("habitat", (id) => habitats.value.some((h) => h.id === id), (id) => (selectedId.value = id), (id) => `canon-habitat-${id}`);

const nameOfPlace = computed(() => new Map(locationOptions.value.map((l) => [l.id, l.name])));
const placeNames = (habitatId: string): string[] =>
  places.value.filter((p) => p.habitatId === habitatId).flatMap((p) => nameOfPlace.value.get(p.locationId) ?? []);
// The worked-out shares by species, so the line says what a roll here would do, not only what the DM typed.
const summaryOf = (habitatId: string): string => {
  const habitat = habitats.value.find((h) => h.id === habitatId);
  return habitat === undefined ? "" : habitatSummary({ habitat, habitatSpecies: habitatSpecies.value, life: life.value, species: species.value, forms: forms.value });
};

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
</script>
