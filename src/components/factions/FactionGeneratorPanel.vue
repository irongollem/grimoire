<template>
  <GeneratorPanelShell
    v-model:open="generatorsUi.factionGeneratorOpen"
    v-model:concept="concept"
    v-model:generate-image="generateImage"
    title="Faction Generator"
    concept-placeholder="A shadowy thieves' guild operating beneath the city's merchant quarter, secretly manipulating trade routes and bribing officials to maintain their monopoly on smuggled goods…"
    :credits="textCreditCost"
    :byok="textIsByok"
    :is-generating="isGenerating"
    :error="genError"
    blank-to="/factions/new"
    blank-label="New Blank Faction"
    image-toggle-label="Generate faction emblem"
    @generate="generateAndCreate"
  >
    <template #constraints>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-caption text-muted-foreground mb-1">Type</label>
          <AppSelect v-model="constraints.faction_type" tone="filled" size="body" weight="normal" block>
            <option value="">Any</option>
            <option v-for="t in FACTION_TYPES" :key="t" :value="t">{{ t }}</option>
          </AppSelect>
        </div>
        <div>
          <label class="block text-caption text-muted-foreground mb-1">Alignment</label>
          <AppSelect v-model="constraints.alignment" tone="filled" size="body" weight="normal" block>
            <option value="">Any</option>
            <option v-for="a in FACTION_ALIGNMENTS" :key="a" :value="a">{{ a }}</option>
          </AppSelect>
        </div>
      </div>
      <div>
        <label class="block text-caption text-muted-foreground mb-1">Leader (NPC)</label>
        <EntityCombobox
          v-model="leaderNpcId"
          :options="npcOptions"
          placeholder="Search NPCs…"
        />
      </div>
      <div>
        <label class="block text-caption text-muted-foreground mb-1">Headquarters</label>
        <EntityCombobox
          v-model="headquartersLocationId"
          :options="locationOptions"
          placeholder="Search locations…"
        />
      </div>
    </template>
  </GeneratorPanelShell>

  <PaywallModal v-model="showQuotaPaywall" resource="factions" />
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { useRouter } from "vue-router";
import { useGeneratorUiStore } from "@/stores/ui/generators";
import { useCreateFaction, useAddFactionNpc, useAddFactionLocation } from "@/composables/factions/useFactions";
import GeneratorPanelShell from "@/components/common/GeneratorPanelShell.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { useFactionGeneration } from "@/ai/useFactionGeneration";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { FACTION_TYPES, FACTION_ALIGNMENTS } from "@/types/faction.types";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useLocationTree } from "@/composables/locations/useLocations";

const generatorsUi = useGeneratorUiStore();
const router   = useRouter();
const { mutateAsync: createFaction }    = useCreateFaction();
const { mutateAsync: addFactionNpc }    = useAddFactionNpc();
const { mutateAsync: addFactionLocation } = useAddFactionLocation();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useFactionGeneration();

// Mounted on every DM page — only fetch the dropdown data once the panel opens.
const panelOpen           = () => generatorsUi.factionGeneratorOpen;
const { data: npcs }      = useNpcs(panelOpen);
const { locationOptions } = useLocationTree(panelOpen);

const { showQuotaPaywall, canSpend, gateQuotaError } = useGenerationGate("factions");

const { costOf } = useAiCredits();
const { textCredits, textIsByok } = useCampaignProviders();
const textCreditCost = computed(
  () => textCredits(costOf("faction_generation")),
);

const concept                = ref("");
const constraints            = reactive({ faction_type: "", alignment: "" });
const generateImage          = ref(true);
const leaderNpcId            = ref("");
const headquartersLocationId = ref("");

const npcOptions = computed(() =>
  (npcs.value ?? []).map((n) => ({ id: n.id, name: n.name })),
);

const leaderNpc = computed(() =>
  npcs.value?.find((n) => n.id === leaderNpcId.value) ?? null,
);
const headquartersLocation = computed(() =>
  locationOptions.value.find((l) => l.id === headquartersLocationId.value) ?? null,
);

async function generateAndCreate() {
  if (!canSpend(textCreditCost.value, textIsByok.value)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();

  const leaderName = leaderNpc.value
    ? leaderNpc.value.occupation
      ? `${leaderNpc.value.name} (${leaderNpc.value.occupation})`
      : leaderNpc.value.name
    : undefined;

  const result = await generate(
    concept.value.trim(),
    {
      faction_type:      constraints.faction_type || undefined,
      alignment:         constraints.alignment || undefined,
      generateImage:     generateImage.value,
      leader_name:       leaderName,
      headquarters_name: headquartersLocation.value?.name || undefined,
    },
  );

  if (!result) return;

  let faction;
  try {
    faction = await createFaction({
      name:              result.name,
      faction_type:      result.faction_type || null,
      alignment:         result.alignment || null,
      description:       toTiptapJson(result.description),
      emblem_url:        result.image_url,
      player_visible_to: [],
      tags:              result.tags,
      ai_provenance:     result.ai_provenance ?? null,
    });
  } catch (e) {
    if (gateQuotaError(e)) return;
    throw e;
  }

  await Promise.all([
    leaderNpcId.value
      ? addFactionNpc({ faction_id: faction.id, npc_id: leaderNpcId.value, role: "Leader" })
      : Promise.resolve(),
    headquartersLocationId.value
      ? addFactionLocation({ faction_id: faction.id, location_id: headquartersLocationId.value })
      : Promise.resolve(),
  ]);

  completedEntityId.value = faction.id;
  generatorsUi.factionGeneratorOpen = false;
  router.push(`/factions/${faction.id}`);
}
</script>
