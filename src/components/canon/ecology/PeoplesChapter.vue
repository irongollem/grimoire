<template>
  <CanonChapter chapter="peoples" :title="chapter.label" :why="chapter.why" :open="selected !== null" back-label="peoples" @close="selectedId = null">
    <ul v-if="peoples.length > 0" class="flex flex-col rounded-lg border border-border bg-card" data-testid="people-list">
      <CanonRow
        v-for="people in peoples"
        :id="`canon-people-${people.id}`"
        :key="people.id"
        :title="people.name"
        strong
        :selected="people.id === selectedId"
        @select="selectedId = people.id"
      >
        <span class="block text-caption text-muted-foreground">{{ people.ownName ? `${people.recordName}, ${people.kind}` : people.kind }}</span>
        <template #mark>
          <span class="whitespace-nowrap text-label font-bold text-foreground" data-testid="people-mark">{{ people.percent }}%</span>
        </template>
      </CanonRow>
    </ul>
    <!-- No Familiar here: the canon helper has no peoples mode, so a request would come back as truths. -->
    <CanonEmpty v-else-if="!isLoading" title="No peoples yet" :text="EMPTY_TEXT" />
    <p v-if="peoples.length > 0" class="m-0 text-caption text-muted-foreground" data-testid="share-total">
      Adds up to {{ total }}%.<template v-if="total < 100"> The other {{ sharesRest(total) }}% is anyone else.</template>
      When Grimoire makes up a person, it rolls who they are from these shares. Leave it empty and it is left to the generator.
    </p>

    <template #add>
      <div class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
        <AppInput v-model="newName" tone="filled" size="body" placeholder="Name of this people, if it has its own (the Vell)" aria-label="Name of the people to add" maxlength="80" />
        <div class="flex flex-col gap-2 sm:flex-row">
          <EntityCombobox v-model="speciesPick" :options="speciesOptions" placeholder="Add a species…" />
          <EntityCombobox v-model="creaturePick" :options="creatureOptions" placeholder="Add a creature…" @open="creaturesWanted = true" />
        </div>
        <div class="flex items-center gap-2">
          <AppButton variant="link" size="inline" label="New species" to="/species/new" />
          <AppButton variant="link" size="inline" label="New creature" to="/monsters/new" />
        </div>
        <p class="m-0 text-caption text-muted-foreground">A people is a species or a creature the campaign already has, and may go by a name of its own. Name it to list a second people of the same species. Make a new species or creature, then add it here.</p>
      </div>
    </template>

    <template #entry>
      <PeopleEditor v-if="selected" :key="selected.id" :people="selected" :all="peoples" @close="selectedId = null" @remove="remove(selected.id)" />
    </template>
  </CanonChapter>
</template>

<script setup lang="ts">
/**
 * The Peoples chapter: who lives in the world (#1255 item 30), as shares of the population: `campaign_peoples`. A people is never typed; it is
 * a species or a creature the campaign already has, chosen from two pickers, so it carries the record's own name. The
 * NPC generator rolls from the list and every other generator is told it (the world block). The open people reads beside the
 * list (`PeopleEditor`); which one is open is local to the chapter, since a people is not a canon entry.
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { usePeoplesEditing } from "@/composables/canon/useCampaignPeoples";
import { useMonsterIndex } from "@/composables/monsters/useMonsterIndex";
import { useCampaignSpecies } from "@/composables/rules/useSpecies";
import CanonChapter from "../kit/CanonChapter.vue";
import CanonEmpty from "../kit/CanonEmpty.vue";
import CanonRow from "../kit/CanonRow.vue";
import PeopleEditor from "./PeopleEditor.vue";
import type { People } from "@/lib/canon/peoples";
import { chapterOf } from "@/lib/canon/canonParts";
import { sharesRest, sharesTotal } from "@/lib/canon/shares";
import { isUuid } from "@/lib/library/contentIdentity";

const EMPTY_TEXT = "The world's peoples and cultures: who lives where, how they live, and what they want of each other.";
const chapter = chapterOf("peoples");

const { peoples, isLoading, addPeople, removePeople } = usePeoplesEditing();
const { data: species } = useCampaignSpecies();

const selectedId = ref<string | null>(null);
const selected = computed(() => peoples.value.find((p) => p.id === selectedId.value) ?? null);
const total = computed(() => sharesTotal(peoples.value));

function remove(id: string) {
  removePeople(id);
  selectedId.value = null;
}

// Add-pickers: each adds a people at 0% and empties itself, so they are local state, not a list filter.
const speciesPick = ref("");
const creaturePick = ref("");
const creaturesWanted = ref(false);
// The bestiary index is the encounter picker's own read; it loads when the creature picker is first opened.
const { data: creatureIndex } = useMonsterIndex(() => ({ enabled: creaturesWanted.value }));

// The name typed for the next people to add; an add-picker's own state, emptied with the pick.
const newName = ref("");
// A record is offered again when the people to add is named: only an unnamed duplicate is refused (the table's rule).
const listed = (kind: People["kind"]) =>
  new Set(newName.value.trim() !== "" ? [] : peoples.value.filter((p) => p.kind === kind && p.ownName === null).map((p) => p.recordId));
const speciesOptions = computed(() => {
  const taken = listed("species");
  return species.value.filter((s) => !taken.has(s.id));
});
const creatureOptions = computed(() => {
  const taken = listed("creature");
  return (creatureIndex.value ?? []).filter((m) => !taken.has(m.id));
});

watch(speciesPick, (id) => {
  if (!id) return;
  addPeople({ kind: "species", recordId: id, fromLibrary: !isUuid(id), percent: 0, name: newName.value });
  speciesPick.value = "";
  newName.value = "";
});
watch(creaturePick, (id) => {
  if (!id) return;
  const entry = creatureIndex.value?.find((m) => m.id === id);
  if (!entry) return;
  addPeople({ kind: "creature", recordId: id, fromLibrary: entry.is_shared, percent: 0, name: newName.value });
  creaturePick.value = "";
  newName.value = "";
});
</script>
