<template>
  <div class="flex flex-col gap-3.5" data-testid="habitat-life">
    <p class="m-0 text-caption text-muted-foreground">
      Choose how common each species is here. Grimoire works out how often it is met from that and how it lives; type a share to set it yourself, and the others make room.
    </p>

    <HabitatSpeciesSlip
      v-for="row in rows.species"
      :key="row.habitatSpeciesId"
      :row="row"
      :image="pictureOf(row)"
      @abundance="(value) => setAbundance(row.habitatSpeciesId, value)"
      @share="saveShare"
      @remove="removeHabitatSpecies(row.habitatSpeciesId)"
    />

    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1" data-testid="habitat-other">
      <span class="text-body text-foreground">Anything else</span>
      <span class="flex items-center gap-1">
        <AppInput v-model.lazy.number="otherModel" type="number" size="sm" align="right" :block="false" class="w-20" :placeholder="String(rows.other.worked)" aria-label="Share of anything else, percent" />
        <span class="w-4 text-caption text-muted-foreground" aria-hidden="true">%</span>
      </span>
    </div>
    <p v-if="problem" class="m-0 text-caption text-destructive" role="alert" data-testid="share-problem">{{ problem }}</p>
    <p v-else class="m-0 text-caption text-muted-foreground" data-testid="share-total">Adds up to 100%.</p>

    <MentionTextarea v-model="adding" :items="options" :rows="1" placeholder="@ a species from the field guide…" aria-label="Add a species that lives here" hand @item-selected="add" @keydown.enter.prevent />
  </div>
</template>

<script setup lang="ts">
/**
 * What lives in a habitat (#1283, frame U02): the species of the field guide that live here, each with how common it is
 * and its share of the roll, and "anything else" for what no species here accounts for. A species is never typed: it is
 * picked from the field guide with an @, so it carries the guide's own name and forms. Everything here is saved as it is
 * changed; a total past 100 is said first and not sent, because the table would refuse it.
 */
import { computed, ref } from "vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import MentionTextarea from "@/components/common/controls/MentionTextarea.vue";
import HabitatSpeciesSlip from "./HabitatSpeciesSlip.vue";
import { useHabitatEditing } from "@/composables/canon/useCampaignHabitats";
import { useCampaignSpecies } from "@/composables/canon/useCampaignSpecies";
import { useMonstersByIds } from "@/composables/monsters/useMonstersByIds";
import { buildHabitatRows, proposedSharesProblem, type SpeciesRow } from "@/lib/canon/habitatRows";
import type { Habitat } from "@/lib/canon/habitats";

const { habitat } = defineProps<{ habitat: Habitat }>();
const { habitatSpecies, life, addHabitatSpecies, setAbundance, removeHabitatSpecies, setFormPercent, setOtherPercent } = useHabitatEditing();
const { species, forms } = useCampaignSpecies();

const rows = computed(() => buildHabitatRows({ habitat, habitatSpecies: habitatSpecies.value, life: life.value, species: species.value, forms: forms.value }));
const here = computed(() => life.value.filter((l) => l.habitatId === habitat.id));

// The picture of a species is its stand-in form's stat block image; a form with none leaves the slip its initial.
const { data: monsters } = useMonstersByIds(() => rows.value.species.map((r) => r.pictureOf), { withArt: true });
const pictureOf = (row: SpeciesRow): string | null => (row.pictureOf === null ? null : (monsters.value.get(row.pictureOf)?.image_url ?? null));

const problem = ref<string | null>(null);
function refuse(said: string | null): boolean {
  problem.value = said;
  return said !== null;
}
function saveShare(lifeId: string, percent: number | null) {
  if (refuse(proposedSharesProblem(here.value, habitat.otherPercent, { lifeId, percent }))) return;
  setFormPercent(lifeId, percent);
}
const otherModel = computed<number | null>({
  get: () => habitat.otherPercent,
  set: (percent) => {
    if (refuse(proposedSharesProblem(here.value, habitat.otherPercent, { other: percent }))) return;
    setOtherPercent(habitat.id, percent);
  },
});

// An add-picker: it adds the species and empties itself, so it is local state, not a list filter.
const adding = ref("");
const options = computed(() => {
  const taken = new Set(habitatSpecies.value.filter((h) => h.habitatId === habitat.id).map((h) => h.speciesId));
  return species.value.filter((s) => !taken.has(s.id)).map((s) => ({ id: s.id, label: s.name, entityType: "species" as const }));
});
function add({ item }: { item: { id: string } }) {
  addHabitatSpecies(habitat.id, item.id);
  adding.value = "";
}
</script>
