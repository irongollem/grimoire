<template>
  <div class="flex flex-col gap-3" data-testid="world-peoples">
    <p class="text-caption text-muted-foreground">
      When Grimoire makes up a person, it rolls who they are from these shares. Leave it empty and it is left to the generator.
    </p>
    <div v-if="peoples.length" class="flex flex-col gap-2">
      <div v-for="row in peoples" :key="row.id" class="flex items-center gap-2 rounded-lg border border-border bg-card p-2" data-testid="people-row">
        <span class="min-w-0 flex-1 truncate text-body text-foreground">{{ row.name }}</span>
        <span class="shrink-0 text-caption text-muted-foreground">{{ row.kind }}</span>
        <div class="flex shrink-0 items-center gap-1">
          <AppInput
            v-model.lazy.number="drafts[row.id]"
            type="number"
            tone="filled"
            size="body"
            align="right"
            :block="false"
            class="w-20"
            :aria-label="`Share of ${row.name}, percent`"
          />
          <span class="text-body text-muted-foreground" aria-hidden="true">%</span>
        </div>
        <AppButton variant="ghost" size="icon-sm" :icon="IconClose" :aria-label="`Remove ${row.name}`" @click="removePeople(row.id)" />
      </div>
    </div>
    <p v-if="peoples.length && !problem" class="text-caption text-muted-foreground" data-testid="peoples-total">
      Adds up to {{ total }}%.<template v-if="total < 100"> The other {{ rest }}% is anyone else.</template>
    </p>
    <p v-if="problem" class="text-caption text-destructive" role="alert">{{ problem }}</p>
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
 * NPC generator rolls from the list and every other generator is told it (the world block). A share saves when the
 * field is left, and not while the list has a problem the database would refuse (a total past 100), which it says instead.
 */
import { computed, reactive, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { usePeoplesEditing } from "@/composables/canon/useCampaignPeoples";
import { useMonsterIndex } from "@/composables/monsters/useMonsterIndex";
import { useCampaignSpecies } from "@/composables/rules/useSpecies";
import { peoplesProblem, peoplesTotal, type People } from "@/lib/canon/peoples";
import { IconClose } from "@/lib/icons";
import { isUuid } from "@/lib/library/contentIdentity";

const { peoples, addPeople, setPercent, removePeople } = usePeoplesEditing();
const { data: species } = useCampaignSpecies();

// The share fields: what is typed, `null` once cleared. The server's value rules until the DM changes a field.
const drafts = reactive<Record<string, number | null>>({});
watch(peoples, (list) => {
  const ids = new Set(list.map((p) => p.id));
  for (const id of Object.keys(drafts)) if (!ids.has(id)) delete drafts[id];
  for (const p of list) drafts[p.id] = p.percent;
}, { immediate: true });

/** The list as the screen holds it: a cleared share field counts as not a number, so it is named and not saved. */
const shown = computed<People[]>(() => peoples.value.map((p) => ({ ...p, percent: drafts[p.id] ?? Number.NaN })));
const problem = computed(() => peoplesProblem(shown.value));
const total = computed(() => peoplesTotal(shown.value.map((p) => ({ percent: Number.isFinite(p.percent) ? p.percent : 0 }))));
const rest = computed(() => Math.round((100 - total.value) * 100) / 100);

// A change that would pass 100 (or is not a share) is never sent: the screen names it, and nothing is saved until it is fixed.
watch(drafts, () => {
  if (problem.value) return;
  for (const p of peoples.value) {
    const draft = drafts[p.id];
    if (typeof draft === "number" && draft !== p.percent) setPercent(p.id, draft);
  }
}, { deep: true });

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
