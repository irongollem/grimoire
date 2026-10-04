<template>
  <GeneratorPanelShell
    v-model:open="ui.locationGeneratorOpen"
    v-model:concept="concept"
    v-model:generate-image="generateImage"
    title="Location Generator"
    concept-placeholder="A crumbling dwarven forge district deep beneath the mountain, long abandoned after a cave-in sealed the lower tunnels and the forgemasters never returned…"
    :credits="effectiveCreditCost"
    :byok="fullyByok"
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
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCreateLocation, useLocationTree } from "@/composables/locations/useLocations";
import { useImageGenerationLog } from "@/composables/ai/useImageGenerationLog";
import { useToast } from "@/composables/useToast";
import PaywallModal from "@/components/common/PaywallModal.vue";
import GeneratorPanelShell from "@/components/common/GeneratorPanelShell.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useLocationGeneration } from "@/ai/useLocationGeneration";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { LOCATION_TYPE_LABELS } from "@/types/location.types";
import type { LocationType } from "@/types/location.types";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { placeRoute } from "@/lib/locations/placeRoute";
import { wholeCredits } from "@edge-shared/credit-math.ts";

const TYPE_OPTIONS = Object.entries(LOCATION_TYPE_LABELS) as [LocationType, string][];

const ui       = useUiStore();
const router   = useRouter();
const campaign = useCampaignStore();
const { mutateAsync: createLocation } = useCreateLocation();
const { logImageGeneration } = useImageGenerationLog();
// Mounted on every DM page — only fetch the parent-location tree once the panel opens.
const { locationOptions } = useLocationTree(() => ui.locationGeneratorOpen);
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useLocationGeneration();

const isAiEnabled = computed(() => campaign.isAiEnabled);
const toast = useToast();

const { showQuotaPaywall, canSpend, gateQuotaError } = useGenerationGate("locations");

const { costOf } = useAiCredits();
const { textMultiplierFor, imageMultiplierFor } = useProviderConfig();

const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok   = computed(() => !!campaign.decryptedApiKey);
const imageIsByok  = computed(() => !!campaign.decryptedOpenAiKey);
// Whole generation is BYOK-covered only when every image actually being
// generated is covered too — a scene or map still charged while the text
// call is free is not a BYOK generation.
const fullyByok = computed(
  () => textIsByok.value && (imageIsByok.value || (!generateImage.value && !generateMap.value)),
);

const effectiveCreditCost = computed(() => {
  let cost = textIsByok.value
    ? 0
    : wholeCredits(costOf("location_generation") * textMultiplierFor(textProvider.value));
  // Scene + map are each a separate entity_image charge (square → 1.0×).
  if (!imageIsByok.value) {
    const perImage = wholeCredits(costOf("entity_image", { size: "1024x1024" }) * imageMultiplierFor("openai"));
    if (generateImage.value) cost += perImage;
    if (generateMap.value)   cost += perImage;
  }
  return cost;
});

const concept          = ref("");
const constraints      = reactive({ location_type: "" });
const parentLocationId = ref("");
const parentLocation   = computed(() => locationOptions.value.find((l) => l.id === parentLocationId.value) ?? null);
const generateImage    = ref(true);
const generateMap      = ref(false);

async function generateAndCreate() {
  if (!canSpend(effectiveCreditCost.value, fullyByok.value)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();

  const result = await generate(
    concept.value.trim(),
    {
      location_type: constraints.location_type || undefined,
      parent_name:   parentLocation.value?.name || undefined,
      generateImage: generateImage.value,
      generateMap:   generateMap.value,
    },
  );

  if (!result) return;

  // The generation has already been paid for, so a failed save must say so
  // rather than vanish as an unhandled rejection — a non-quota failure gets
  // the toast (gateQuotaError handles the quota case).
  let location;
  try {
    location = await createLocation({
      name:                  result.name,
      location_type:         (constraints.location_type as LocationType) || "other",
      description:           toTiptapJson(result.description),
      player_summary:        result.player_summary || null,
      tags:                  result.tags,
      notes:                 result.notes || null,
      era_start:             null,
      era_end:               null,
      parent_id:             parentLocationId.value || null,
      image_url:             result.image_url,
      map_url:               result.map_url,
      map_pins:              [],
      is_map_shared:         false,
      player_visible_to:     [],
      is_description_shared: false,
      is_npcs_shared:        false,
      is_inventory_shared:   false,
      npc_owner_id:          null,
      related_location_ids:  [],
      source_map_id:         null,
      is_battle_map:         false,
      grid_calibration:      null,
      ai_provenance:         result.ai_provenance ?? null,
    });
  } catch (e) {
    if (gateQuotaError(e)) return;
    toast.error(toast.fromError(e));
    return;
  }

  // Log generated scene + map to the Gallery, linked back to the new location.
  if (result.image_url) {
    void logImageGeneration({
      kind: "location", imageUrl: result.image_url, prompt: genConcept.value,
      targetId: location.id, targetColumn: "image_url",
    });
  }
  if (result.map_url) {
    void logImageGeneration({
      kind: "map", imageUrl: result.map_url, prompt: genConcept.value,
      targetId: location.id, targetColumn: "map_url",
    });
  }

  completedEntityId.value = location.id;
  ui.locationGeneratorOpen = false;
  router.push(placeRoute(location.id));
}
</script>
