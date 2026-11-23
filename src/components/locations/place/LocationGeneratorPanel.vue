<template>
  <GeneratorPanelShell
    v-model:open="generatorsUi.locationGeneratorOpen"
    v-model:concept="concept"
    v-model:generate-image="generateImage"
    title="Location Generator"
    concept-placeholder="A crumbling dwarven forge district deep beneath the mountain, long abandoned after a cave-in sealed the lower tunnels and the forgemasters never returned…"
    :credits="quote.total"
    :byok="quote.byok"
    :is-generating="isGenerating"
    :error="genError"
    blank-to="/locations/new"
    blank-label="New Blank Location"
    image-toggle-label="Generate location art"
    @generate="generateAndCreate"
  >
    <template #constraints>
      <div class="space-y-2">
        <div>
          <label class="block text-caption text-muted-foreground mb-1">Location Type</label>
          <AppSelect v-model="constraints.location_type" tone="filled" size="body" weight="normal" block>
            <option value="">Any</option>
            <option v-for="[value, label] in TYPE_OPTIONS" :key="value" :value="value">{{ label }}</option>
          </AppSelect>
        </div>
        <div>
          <label class="block text-caption text-muted-foreground mb-1">Parent Location</label>
          <EntityCombobox
            v-model="parentLocationId"
            :options="locationOptions"
            placeholder="Search locations…"
          />
        </div>
        <div>
          <label class="block text-caption text-muted-foreground mb-1">Kept by</label>
          <EntityCombobox
            v-model="keeperNpcId"
            :options="npcs ?? []"
            placeholder="Search NPCs…"
          />
        </div>
        <!-- Every other tie (a faction that holds it, a god worshipped there, an item kept there) has no field above. -->
        <GeneratorLinksField v-model="links" subject-kind="location" noun="this place" />
      </div>
    </template>

    <template #extra>
      <div v-if="isAiEnabled" class="flex items-center justify-between">
        <span class="text-caption text-muted-foreground">Generate map sketch</span>
        <ToggleSwitch v-model="generateMap" aria-label="Generate map sketch" />
      </div>
    </template>
  </GeneratorPanelShell>

  <PaywallModal v-model="showQuotaPaywall" resource="locations" />
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { useRouter } from "vue-router";
import { useGeneratorUiStore } from "@/stores/ui/generators";
import { useCampaignStore } from "@/stores/campaign";
import { useLocationTree } from "@/composables/locations/useLocations";
import { useToast } from "@/composables/useToast";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import GeneratorPanelShell from "@/components/common/ai/GeneratorPanelShell.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import ToggleSwitch from "@/components/common/controls/ToggleSwitch.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import GeneratorLinksField from "@/components/generators/GeneratorLinksField.vue";
import { useNpcs } from "@/composables/npcs/useNpcs";
import type { GeneratorLink } from "@/lib/worldLinks/generatorLinks";
import { useLocationGeneration } from "@/ai/useLocationGeneration";
import { LOCATION_TYPE_LABELS } from "@/types/location.types";
import type { LocationType } from "@/types/location.types";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useLocationQuote } from "@/composables/ai/quotes/locationQuote";
import { useGenerateLocation } from "@/composables/locations/useGenerateLocation";
import { placeRoute } from "@/lib/locations/placeRoute";

const TYPE_OPTIONS = Object.entries(LOCATION_TYPE_LABELS) as [LocationType, string][];

const generatorsUi = useGeneratorUiStore();
const router   = useRouter();
const campaign = useCampaignStore();
const { generateAndCreateLocation } = useGenerateLocation();
// Mounted on every DM page — only fetch the parent-location tree once the panel opens.
const { locationOptions } = useLocationTree(() => generatorsUi.locationGeneratorOpen);
// The keeper is picked from the campaign's NPCs, read only while the panel is open like the tree above.
const { data: npcs } = useNpcs(() => generatorsUi.locationGeneratorOpen);
// The shared generation state `useGenerateLocation` drives underneath; this panel reads it for its own loading UI.
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted } = useLocationGeneration();

const isAiEnabled = computed(() => campaign.isAiEnabled);
const toast = useToast();

const { showQuotaPaywall, canSpend, gateQuotaError } = useGenerationGate("locations");

const quoteLocation = useLocationQuote();

const concept          = ref("");
const constraints      = reactive({ location_type: "" });
const parentLocationId = ref("");
const parentLocation   = computed(() => locationOptions.value.find((l) => l.id === parentLocationId.value) ?? null);
const keeperNpcId      = ref("");
// Ties to existing records beyond the parent and the keeper, written once the place is saved.
const links            = ref<GeneratorLink[]>([]);
const generateImage    = ref(true);
const generateMap      = ref(false);

// The price Ask Grimoire quotes for the same run. A scene or map still charged while the text is free is not a BYOK
// generation, and each picture is its own charge; null while any charged part has no known price yet.
const quote = computed(() => quoteLocation({ image: generateImage.value, map: generateMap.value }));

async function generateAndCreate() {
  if (!canSpend(quote.value.total, quote.value.byok)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();

  // The generation has already been paid for, so a failed save must say so
  // rather than vanish as an unhandled rejection — a non-quota failure gets
  // the toast (gateQuotaError handles the quota case).
  let outcome;
  try {
    outcome = await generateAndCreateLocation(concept.value.trim(), {
      locationType:  (constraints.location_type as LocationType) || undefined,
      parent:        parentLocation.value,
      keeperNpcId:   keeperNpcId.value || null,
      links:         links.value,
      generateImage: generateImage.value,
      generateMap:   generateMap.value,
    });
  } catch (e) {
    if (gateQuotaError(e)) return;
    toast.error(toast.fromError(e));
    return;
  }
  if (!outcome.id) return;
  if (outcome.linkErrors.length) toast.error(`Place created, but some connections could not be added: ${outcome.linkErrors.join("; ")}`);

  completedEntityId.value = outcome.id;
  generatorsUi.locationGeneratorOpen = false;
  router.push(placeRoute(outcome.id));
}
</script>
