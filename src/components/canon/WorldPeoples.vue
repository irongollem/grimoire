<template>
  <div class="flex flex-col gap-3" data-testid="world-peoples">
    <p class="text-caption text-muted-foreground">
      When Grimoire makes up a person, it rolls who they are from these shares. Leave it empty and it is left to the generator.
    </p>
    <div v-if="draft.peoples.length" class="flex flex-col gap-2">
      <div v-for="(row, i) in draft.peoples" :key="row.uid" class="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
        <AppInput
          v-model="row.name"
          list="canon-world-peoples"
          tone="filled"
          size="body"
          placeholder="Elves, dwarves, anyone…"
          :aria-label="`Name of people ${i + 1}`"
        />
        <div class="flex shrink-0 items-center gap-1">
          <AppInput
            v-model.number="row.percent"
            type="number"
            tone="filled"
            size="body"
            align="right"
            :block="false"
            class="w-20"
            :aria-label="`Share of ${row.name.trim() || `people ${i + 1}`}, percent`"
          />
          <span class="text-body text-muted-foreground" aria-hidden="true">%</span>
        </div>
        <AppButton variant="ghost" size="icon-sm" :icon="IconClose" :aria-label="`Remove ${row.name.trim() || `people ${i + 1}`}`" @click="remove(row.uid)" />
      </div>
    </div>
    <div>
      <AppButton variant="outline" size="sm" :icon="IconAdd" label="Add a people" :disabled="draft.peoples.length >= MAX_PEOPLES" @click="add" />
    </div>
    <datalist id="canon-world-peoples">
      <option v-for="name in speciesNames" :key="name" :value="name" />
    </datalist>
    <p v-if="draft.peoples.length && !problem" class="text-caption text-muted-foreground" data-testid="peoples-total">
      Adds up to {{ total }}%.<template v-if="total < 100"> The other {{ rest }}% is anyone else.</template>
    </p>
    <p v-if="problem" class="text-caption text-destructive" role="alert">{{ problem }}</p>
    <AutosaveStatus :status="status" :error="saveError" paused-label="Fix the shares to save them" />
  </div>
</template>

<script setup lang="ts">
/**
 * Who lives in the world (#1255 item 30), as shares of the population: `campaigns.peoples`. The NPC generator rolls from
 * it and every other generator is told it (the world block). It saves after a pause, and never while the list has a
 * problem the table would refuse (a blank name, a name twice, a total past 100), which it says instead.
 */
import { computed, reactive, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import { useCampaignById, useUpdateCampaign } from "@/composables/campaign/useCampaigns";
import { useCampaignSpecies } from "@/composables/rules/useSpecies";
import { useAutosave } from "@/composables/useAutosave";
import { IconAdd, IconClose } from "@/lib/icons";
import { MAX_PEOPLES, peoplesProblem, peoplesTotal, type People } from "@/lib/canon/peoples";
import { useCampaignStore } from "@/stores/campaign";
import type { Campaign } from "@/types/campaign.types";

/** A row on screen: a cleared share field is `null` until the DM types one. */
interface Row { uid: number; name: string; percent: number | null }
interface PeoplesDraft { peoples: Row[] }

const campaignStore = useCampaignStore();
const { mutateAsync: updateCampaign } = useUpdateCampaign();
const { data: live } = useCampaignById(() => campaignStore.activeCampaignId);
const campaign = computed<Campaign | null>(() => live.value ?? campaignStore.activeCampaign);
const { data: species } = useCampaignSpecies();
const speciesNames = computed(() => [...new Set(species.value.map((s) => s.name))]);

let nextUid = 1;
const toRows = (list: readonly People[] | undefined): Row[] => (list ?? []).map((p) => ({ uid: nextUid++, name: p.name, percent: p.percent }));
const draft = reactive<PeoplesDraft>({ peoples: toRows(campaign.value?.peoples) });

/** What the table would see: a share left blank counts as not a number, so it is named rather than saved as zero. */
const asPeoples = (rows: readonly Row[]): People[] => rows.map((r) => ({ name: r.name, percent: r.percent ?? Number.NaN }));
const problem = computed(() => peoplesProblem(asPeoples(draft.peoples)));
const total = computed(() => peoplesTotal(draft.peoples.map((r) => ({ name: r.name, percent: r.percent ?? 0 }))));
const rest = computed(() => Math.round((100 - total.value) * 100) / 100);

const sameList = (a: readonly Row[], b: readonly Row[]): boolean =>
  a.length === b.length && a.every((row, i) => row.name === b[i]?.name && row.percent === b[i]?.percent);

const { status, saveError, dirty, reset } = useAutosave<PeoplesDraft>({
  draft,
  initial: () => ({ peoples: toRows(campaign.value?.peoples) }),
  equal: (a, b) => sameList(a.peoples, b.peoples),
  canSave: () => problem.value === null,
  save: async (snapshot) => {
    const c = campaign.value;
    if (!c) return;
    const peoples = asPeoples(snapshot.peoples).map((p) => ({ name: p.name.trim(), percent: p.percent }));
    const updated = await updateCampaign({ id: c.id, update: { peoples } });
    campaignStore.switchToCampaign(updated);
  },
});
watch(() => campaign.value?.peoples, (next) => {
  if (!dirty.value) reset({ peoples: toRows(next) });
});

function add() {
  draft.peoples.push({ uid: nextUid++, name: "", percent: 0 });
}
function remove(uid: number) {
  draft.peoples = draft.peoples.filter((r) => r.uid !== uid);
}
</script>
