<template>
  <div class="flex flex-col gap-3" data-testid="world-peoples">
    <p class="text-caption text-muted-foreground">
      When Grimoire makes up a person, it rolls who they are from these shares. Leave it empty and it is left to the generator.
    </p>
    <ShareList :items="items" whole="the whole population" remainder="anyone else" @set="setPercent" @remove="removePeople" />
    <div class="flex flex-col gap-2 sm:flex-row">
      <EntityCombobox v-model="speciesPick" :options="speciesOptions" placeholder="Add a species…" />
      <EntityCombobox v-model="creaturePick" :options="creatureOptions" placeholder="Add a creature…" @open="creaturesWanted = true" />
    </div>
    <div class="flex items-center gap-2">
      <AppButton variant="link" size="inline" label="New species" to="/species/new" />
      <AppButton variant="link" size="inline" label="New creature" to="/monsters/new" />
    </div>
    <p class="text-caption text-muted-foreground">A people is a species or a creature the campaign already has. Make a new one, then add it here.</p>
  </div>
</template>

<script setup lang="ts">
/**
 * Who lives in the world (#1255 item 30), as shares of the population: `campaign_peoples`. A people is never typed; it is
 * a species or a creature the campaign already has, chosen from two pickers, so it carries the record's own name. The
 * NPC generator rolls from the list and every other generator is told it (the world block). The shares are `ShareList`'s:
 * a share saves when its field is left, and not while the list has a problem the database would refuse (a total past 100).
 */
import { computed, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { usePeoplesEditing } from "@/composables/canon/useCampaignPeoples";
import { useMonsterIndex } from "@/composables/monsters/useMonsterIndex";
import { useCampaignSpecies } from "@/composables/rules/useSpecies";
import ShareList from "./ShareList.vue";
import type { People } from "@/lib/canon/peoples";
import { isUuid } from "@/lib/library/contentIdentity";

const { peoples, addPeople, setPercent, removePeople } = usePeoplesEditing();
const { data: species } = useCampaignSpecies();

const items = computed(() => peoples.value.map((p) => ({ id: p.id, name: p.name, percent: p.percent, tag: p.kind })));

// Add-pickers: each adds a people at 0% and empties itself, so they are local state, not a list filter.
const speciesPick = ref("");
const creaturePick = ref("");
const creaturesWanted = ref(false);
// The bestiary index is the encounter picker's own read; it loads when the creature picker is first opened.
const { data: creatureIndex } = useMonsterIndex(() => ({ enabled: creaturesWanted.value }));

const listed = (kind: People["kind"]) => new Set(peoples.value.filter((p) => p.kind === kind).map((p) => p.recordId));
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
  addPeople({ kind: "species", recordId: id, fromLibrary: !isUuid(id), percent: 0 });
  speciesPick.value = "";
});
watch(creaturePick, (id) => {
  if (!id) return;
  const entry = creatureIndex.value?.find((m) => m.id === id);
  if (!entry) return;
  addPeople({ kind: "creature", recordId: id, fromLibrary: entry.is_shared, percent: 0 });
  creaturePick.value = "";
});
</script>
