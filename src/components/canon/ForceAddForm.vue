<template>
  <form class="flex flex-col gap-2" data-testid="force-add-form" @submit.prevent="addForce">
    <fieldset class="flex min-w-0 flex-col gap-2" :disabled="isSaving || unlinkedForceId !== null">
      <div class="flex min-w-0 flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground">Who</span>
        <span v-if="fixedFaction !== undefined" class="text-body text-foreground" data-testid="force-add-who">{{ fixedFaction.name }}</span>
        <EntityCombobox
          v-else
          :model-value="chosenFactionId"
          :options="factions ?? []"
          placeholder="A faction, if one is behind it…"
          @update:model-value="chooseFaction"
        />
      </div>
      <div class="flex min-w-0 flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground">What they are doing</span>
        <AppInput v-model="title" tone="filled" size="body" placeholder="The summoning, the long march…" aria-label="What they are doing" />
      </div>
    </fieldset>
    <div class="flex flex-wrap gap-2">
      <AppInput v-model="wants" tone="filled" size="body" class="min-w-0 flex-1 basis-48" placeholder="What it wants, in one line…" aria-label="What the new force wants" :disabled="isSaving || unlinkedForceId !== null" />
      <AppSelect v-model="clockSize" size="body" aria-label="Clock size" :disabled="isSaving || unlinkedForceId !== null">
        <option :value="null">No clock</option>
        <option v-for="n in CLOCK_SIZES" :key="n" :value="n">{{ n }} ticks</option>
      </AppSelect>
      <AppButton type="submit" variant="outline" class="whitespace-nowrap" :icon="IconAdd" icon-size="xs" :label="unlinkedForceId === null ? 'Add force' : 'Retry faction link'" :loading="isSaving" :disabled="!canSubmit" />
      <AppButton v-if="unlinkedForceId !== null && !isSaving" type="button" variant="subtle" label="Keep force without link" @click="finishForce(unlinkedForceId)" />
    </div>
  </form>
</template>

<script setup lang="ts">
/**
 * The add-a-force form (#1258 item 16), on the canon page and on a faction's page. A force is *who* (a faction, optional)
 * doing *what* (its title, required): the title is the plan, never a copy of the faction's name, so renaming the faction
 * leaves nothing stale and one faction can have two plans. With `factionId` the who is fixed to that faction.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import { useCreateCanonEntryInCampaign } from "@/composables/canon/useCanonEntries";
import { useCreateConnectionInCampaign } from "@/composables/connections/useConnections";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useCampaignStore } from "@/stores/campaign";
import { IconAdd } from "@/lib/icons";
import { toast } from "@/lib/toast";
import { typeChoices } from "@/lib/worldLinks/connections";

const { sortOrder, factionId: fixedFactionId = "" } = defineProps<{
  /** Where the new force lands in the list. */
  sortOrder: number;
  /** The faction the force is about, fixed; empty lets the DM choose or choose none. */
  factionId?: string;
}>();
const emit = defineEmits<{ added: [forceId: string] }>();

const CLOCK_SIZES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const title = ref("");
const wants = ref("");
const clockSize = ref<number | null>(null);
const chosenFactionId = ref("");
const { data: factions } = useAllFactions();
const selectedId = computed(() => (fixedFactionId !== "" ? fixedFactionId : chosenFactionId.value));
const faction = computed(() => (selectedId.value === "" ? undefined : factions.value?.find((row) => row.id === selectedId.value)));
const fixedFaction = computed(() => (fixedFactionId === "" ? undefined : faction.value ?? { name: "…" }));
const { mutateAsync: create } = useCreateCanonEntryInCampaign();
const { mutateAsync: connect } = useCreateConnectionInCampaign();
const campaign = useCampaignStore();
const isSaving = ref(false);
// A retry after a failed link finishes the saved force instead of creating a second row.
const unlinkedForceId = ref<string | null>(null);
const unlinkedForceCampaignId = ref<string | null>(null);
const canSubmit = computed(() => {
  if (isSaving.value || title.value.trim() === "" || wants.value.trim() === "") return false;
  return selectedId.value === "" || faction.value !== undefined;
});

function chooseFaction(id: string) {
  if (!isSaving.value && unlinkedForceId.value === null) chosenFactionId.value = id;
}

function finishForce(forceId: string) {
  title.value = "";
  wants.value = "";
  clockSize.value = null;
  chosenFactionId.value = "";
  unlinkedForceId.value = null;
  unlinkedForceCampaignId.value = null;
  emit("added", forceId);
}

async function addForce() {
  if (!canSubmit.value) return;
  const campaignId = campaign.activeCampaignId;
  if (!campaignId) return;
  if (unlinkedForceId.value !== null && unlinkedForceCampaignId.value !== campaignId) {
    toast.error("Switch back to the campaign where this force was started, then retry the faction link.");
    return;
  }
  const selectedFaction = faction.value;
  isSaving.value = true;
  try {
    if (unlinkedForceId.value === null) {
      const created = await create({ campaignId, input: {
        part: "force",
        title: title.value.trim(),
        wants: wants.value.trim(),
        ...(clockSize.value === null ? {} : { clock_size: clockSize.value }),
        sort_order: sortOrder,
      } });
      unlinkedForceId.value = created.id;
      unlinkedForceCampaignId.value = campaignId;
    }
    if (selectedFaction) {
      const choice = typeChoices("canon", "faction").find((entry) => entry.key === "about" && entry.subjectIsFrom);
      if (!choice) throw new Error("A force cannot be linked to a faction.");
      await connect({ input: {
        subject: { kind: "canon", id: unlinkedForceId.value },
        other: { kind: "faction", id: selectedFaction.id, name: selectedFaction.name },
        choice,
      }, campaignId });
    }
    finishForce(unlinkedForceId.value);
  } catch (error) {
    // Create reports its own error. Keep the saved force and inputs if its faction link failed.
    if (unlinkedForceId.value !== null) toast.error(`Force saved, but the faction could not be linked. ${toast.fromError(error)}`);
  } finally {
    isSaving.value = false;
  }
}
</script>
