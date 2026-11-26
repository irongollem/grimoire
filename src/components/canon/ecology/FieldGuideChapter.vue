<template>
  <CanonChapter chapter="species" :title="chapter.label" :why="chapter.why" :open="selected !== null" back-label="the field guide" @close="selectedId = null">
    <div class="flex flex-wrap items-center gap-2" data-testid="field-guide-filter">
      <SegmentedControl v-model="kingdom" :options="KINGDOM_OPTIONS" wrap />
      <AppButton v-if="ui.fieldGuideHasActiveFilters" variant="ghost" size="sm" label="Clear" data-testid="field-guide-clear" @click="ui.resetFieldGuideFilters()" />
    </div>

    <div v-if="groups.length > 0" class="flex flex-col gap-4" data-testid="species-list">
      <section v-for="group in groups" :key="group.clade?.id ?? 'none'" :style="{ marginLeft: `${group.depth * 1}rem` }" :aria-label="group.heading" data-testid="species-group">
        <h3 class="m-0 mb-1 text-eyebrow text-muted-foreground" data-testid="species-group-heading">{{ group.heading }}</h3>
        <ul class="flex flex-col rounded-lg border border-border bg-card">
          <CanonRow
            v-for="one in group.species"
            :id="`canon-species-${one.id}`"
            :key="one.id"
            :title="one.name"
            strong
            :selected="one.id === selectedId"
            @select="selectedId = one.id"
          >
            <span v-if="one.scientificName" class="mt-0.5 block text-caption italic text-muted-foreground" data-testid="species-scientific">{{ one.scientificName }}</span>
            <span v-if="habitatNames(one.id).length > 0" class="mt-0.5 block text-caption text-muted-foreground" data-testid="species-habitats">{{ habitatNames(one.id).join(", ") }}</span>
            <template #mark>
              <span class="whitespace-nowrap text-label font-bold text-foreground" data-testid="species-mark">{{ speciesMark(formsOf(one.id)) }}</span>
            </template>
          </CanonRow>
        </ul>
      </section>
    </div>
    <CanonEmpty v-else-if="ready && species.length === 0" title="No species yet" :text="EMPTY_TEXT" />
    <p v-else-if="ready" class="m-0 text-caption italic text-muted-foreground" data-testid="species-none-of-kind">Nothing of that kind is in the field guide yet.</p>

    <template #add>
      <CanonAddRow placeholder="A new species, by its common name…" input-label="A new species" label="Add species" :create="add" />
    </template>

    <template #entry>
      <SpeciesEditor v-if="selected" :key="selected.id" :species="selected" @close="selectedId = null" @delete="selectedId = null" />
    </template>
  </CanonChapter>
</template>

<script setup lang="ts">
/**
 * The Field guide chapter (#1283): the world's living things, grouped under their clades and filtered by kingdom, the open
 * species beside the list. A row names the species, its scientific name and the habitats it lives in, with how many forms
 * it has. `?species=<id>` (a search hit, a mention chip) opens one.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import CanonAddRow from "../CanonAddRow.vue";
import CanonChapter from "../kit/CanonChapter.vue";
import CanonEmpty from "../kit/CanonEmpty.vue";
import CanonRow from "../kit/CanonRow.vue";
import SpeciesEditor from "./SpeciesEditor.vue";
import { useCampaignHabitats } from "@/composables/canon/useCampaignHabitats";
import { useSpeciesEditing } from "@/composables/canon/useCampaignSpecies";
import { useLinkedRow } from "@/composables/canon/useLinkedRow";
import { chapterOf } from "@/lib/canon/canonParts";
import { groupSpecies, KINGDOM_FILTER_OPTIONS, speciesMark } from "@/lib/canon/fieldGuide";
import { useCanonUiStore } from "@/stores/ui/canon";

const EMPTY_TEXT = "A species is one kind of living thing: a plant, an animal, a fungus. Name one, then say what it looks like, what it eats and where it lives.";
const chapter = chapterOf("species");

const ui = useCanonUiStore();
const { species, clades, forms, ready, addSpecies } = useSpeciesEditing();
const { habitats, habitatSpecies } = useCampaignHabitats();

// A writable view of the store's filter for the control; the segmented control has no null value, so "all" is its own word.
const ALL = "all";
const KINGDOM_OPTIONS = KINGDOM_FILTER_OPTIONS.map((o) => ({ value: o.value ?? ALL, label: o.label }));
const kingdom = computed({
  get: () => ui.fieldGuideKingdom ?? ALL,
  set: (value: string) => { ui.fieldGuideKingdom = KINGDOM_FILTER_OPTIONS.find((o) => (o.value ?? ALL) === value)?.value ?? null; },
});

const groups = computed(() => groupSpecies(species.value, clades.value, ui.fieldGuideKingdom));
const formsOf = (speciesId: string) => forms.value.filter((f) => f.speciesId === speciesId);
const habitatNames = (speciesId: string): string[] => {
  const lives = new Set(habitatSpecies.value.filter((h) => h.speciesId === speciesId).map((h) => h.habitatId));
  return habitats.value.filter((h) => lives.has(h.id)).map((h) => h.name);
};

const selectedId = ref<string | null>(null);
const selected = computed(() => species.value.find((s) => s.id === selectedId.value) ?? null);
useLinkedRow("species", (id) => species.value.some((s) => s.id === id), (id) => (selectedId.value = id), (id) => `canon-species-${id}`);

async function add(name: string): Promise<void> {
  const id = await addSpecies(name);
  // The mutation has told the DM when it failed; throwing keeps the words in the box to try again.
  if (id === null) throw new Error("The species was not added.");
  selectedId.value = id;
}
</script>
