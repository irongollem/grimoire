<template>
  <GeneratorPanelShell
    v-model:open="generatorsUi.factionGeneratorOpen"
    v-model:concept="concept"
    v-model:generate-image="generateImage"
    title="Faction Generator"
    concept-placeholder="A shadowy thieves' guild operating beneath the city's merchant quarter, secretly manipulating trade routes and bribing officials to maintain their monopoly on smuggled goods…"
    :credits="quote.total"
    :byok="quote.byok"
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
      <!-- Every other tie (a god they serve, a rival faction, an NPC who works for them) has no field of its own above. -->
      <GeneratorLinksField v-model="links" subject-kind="faction" noun="this faction" />
    </template>
  </GeneratorPanelShell>

  <PaywallModal v-model="showQuotaPaywall" resource="factions" />
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { useRouter } from "vue-router";
import { useGeneratorUiStore } from "@/stores/ui/generators";
import GeneratorPanelShell from "@/components/common/ai/GeneratorPanelShell.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import GeneratorLinksField from "@/components/generators/GeneratorLinksField.vue";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useFactionQuote } from "@/composables/ai/quotes/factionQuote";
import { useGenerateFaction } from "@/composables/factions/useGenerateFaction";
import { useToast } from "@/composables/useToast";
import { useFactionGeneration } from "@/ai/useFactionGeneration";
import { FACTION_TYPES, FACTION_ALIGNMENTS } from "@/types/faction.types";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useLocationTree } from "@/composables/locations/useLocations";
import type { GeneratorLink } from "@/lib/worldLinks/generatorLinks";

const generatorsUi = useGeneratorUiStore();
const router   = useRouter();
const toast    = useToast();

const { generateAndCreateFaction } = useGenerateFaction();
// The shared generation state `useGenerateFaction` drives underneath; this panel reads it for its own loading UI.
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted } = useFactionGeneration();

// Mounted on every DM page — only fetch the dropdown data once the panel opens.
const panelOpen           = () => generatorsUi.factionGeneratorOpen;
const { data: npcs }      = useNpcs(panelOpen);
const { locationOptions } = useLocationTree(panelOpen);

const { showQuotaPaywall, canSpend, gateQuotaError } = useGenerationGate("factions");

const quoteFaction = useFactionQuote();

const concept                = ref("");
const constraints            = reactive({ faction_type: "", alignment: "" });
const generateImage          = ref(true);
const leaderNpcId            = ref("");
const headquartersLocationId = ref("");
const links                  = ref<GeneratorLink[]>([]);

// The price Ask Grimoire quotes for the same run: the emblem counts when it is switched on.
const quote = computed(() => quoteFaction({ image: generateImage.value }));

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
  if (!canSpend(quote.value.total, quote.value.byok)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();

  const leaderName = leaderNpc.value
    ? leaderNpc.value.occupation
      ? `${leaderNpc.value.name} (${leaderNpc.value.occupation})`
      : leaderNpc.value.name
    : undefined;

  let outcome;
  try {
    outcome = await generateAndCreateFaction(concept.value.trim(), {
      faction_type:      constraints.faction_type || undefined,
      alignment:         constraints.alignment || undefined,
      generateImage:     generateImage.value,
      leader_name:       leaderName,
      headquarters_name: headquartersLocation.value?.name || undefined,
      leaderNpcId:            leaderNpcId.value || null,
      headquartersLocationId: headquartersLocationId.value || null,
      links:                  links.value,
    });
  } catch (e) {
    if (gateQuotaError(e)) return;
    throw e;
  }
  if (!outcome.id) return;

  // The faction is saved whatever happened to its leader or headquarters: say what did not link, and open it.
  for (const message of outcome.linkErrors) toast.error(message);

  completedEntityId.value = outcome.id;
  generatorsUi.factionGeneratorOpen = false;
  router.push(`/factions/${outcome.id}`);
}
</script>
