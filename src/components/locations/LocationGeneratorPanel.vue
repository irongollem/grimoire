<template>
  <Transition name="fade">
    <div
      v-if="ui.locationGeneratorOpen"
      class="fixed inset-0 bg-black/60 z-40"
      @click="ui.locationGeneratorOpen = false"
    />
  </Transition>

  <Transition name="slide-right">
    <aside
      v-if="ui.locationGeneratorOpen"
      class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h2 class="text-heading-sm font-semibold text-foreground">Location Generator</h2>
        <AppButton variant="ghost" size="inline-xs" tooltip="Close" aria-label="Close" :icon="IconClose" icon-size="lg" @click="ui.locationGeneratorOpen = false" />
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-5">
        <!-- Concept -->
        <div>
          <label class="block text-label-lg font-semibold text-muted-foreground mb-1.5">
            CONCEPT
            <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(AI will use this)</span>
          </label>
          <textarea
            v-model="concept"
            rows="4"
            :maxlength="CONCEPT_LIMIT"
            placeholder="A crumbling dwarven forge district deep beneath the mountain, long abandoned after a cave-in sealed the lower tunnels and the forgemasters never returned…"
            class="w-full bg-muted border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <div class="flex justify-end mt-1">
            <span
              class="text-caption"
              :class="concept.length >= CONCEPT_LIMIT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
            >{{ concept.length }} / {{ CONCEPT_LIMIT }}</span>
          </div>
        </div>

        <div class="gold-divider" />

        <!-- Constraints -->
        <div class="space-y-3">
          <p class="text-label-lg font-semibold text-muted-foreground">
            CONSTRAINTS
            <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(optional)</span>
          </p>

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
        </div>

        <!-- Image toggles -->
        <div v-if="isAiEnabled" class="space-y-2.5">
          <div class="flex items-center justify-between">
            <span class="text-caption text-muted-foreground">Generate location art</span>
            <ToggleSwitch v-model="generateImage" aria-label="Generate location art" />
          </div>
          <div class="flex items-center justify-between">
            <span class="text-caption text-muted-foreground">Generate map sketch</span>
            <ToggleSwitch v-model="generateMap" aria-label="Generate map sketch" />
          </div>
        </div>

        <!-- No API key nudge -->
        <!-- Generating state -->
        <div v-else-if="isGenerating" class="flex flex-col items-center gap-3 py-4">
          <IconGenerate class="h-7 w-7 text-primary animate-pulse" />
          <p class="text-body text-muted-foreground italic text-center">{{ currentLoadingQuote }}</p>
          <AppButton
            variant="ghost"
            size="inline-caption"
            class="mt-1 underline underline-offset-2"
            label="Continue in background"
            @click="ui.locationGeneratorOpen = false"
          />
        </div>

        <!-- Error -->
        <div
          v-else-if="genError"
          class="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2"
        >
          <p class="text-caption text-destructive">{{ genError }}</p>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-5 py-4 border-t border-border flex flex-col gap-2 shrink-0">
        <p
          v-if="effectiveCreditCost > 0 && isPro && isAiEnabled"
          class="text-caption text-center"
          :class="canAfford ? 'text-muted-foreground' : 'text-destructive font-semibold'"
        >{{ creditLine }}</p>
        <AppButton
          v-if="isPro && isAiEnabled"
          variant="primary"
          size="md"
          block
          :icon="IconGenerate"
          :disabled="isAnyAiGenerating || !concept.trim() || (effectiveCreditCost > 0 && !canAfford)"
          :tooltip="isAnyAiGenerating && !isGenerating ? 'Another generation is already in progress' : undefined"
          :label="isGenerating ? 'Generating…' : 'Generate with AI'"
          @click="generateAndCreate"
        />
        <AppButton
          v-else-if="!isPro"
          variant="primary"
          size="md"
          block
          :icon="IconGenerate"
          label="Generate with AI"
          @click="showPaywall = true"
        />
        <AppButton
          to="/locations/new"
          :variant="isPro && !aiApiKey ? 'primary' : 'outline'"
          size="md"
          block
          label="New Blank Location"
          @click="ui.locationGeneratorOpen = false"
        />
      </div>
    </aside>
  </Transition>
  <PaywallModal v-model="showPaywall" message="AI generation is a Pro feature. Upgrade to generate locations, NPCs, monsters, items, spells, and more." />
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { AI_PROMPT_LIMIT } from "@/ai/utils";

const CONCEPT_LIMIT = AI_PROMPT_LIMIT;
import { useRouter } from "vue-router";
import { IconClose, IconGenerate } from '@/lib/icons';
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCreateLocation, useLocationTree } from "@/composables/locations/useLocations";
import { useImageGenerationLog } from "@/composables/ai/useImageGenerationLog";
import { useSubscription } from "@/composables/billing/useSubscription";
import PaywallModal from "@/components/common/PaywallModal.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useLocationGeneration } from "@/ai/useLocationGeneration";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { LOCATION_TYPE_LABELS } from "@/types/location.types";
import type { LocationType } from "@/types/location.types";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";

const TYPE_OPTIONS = Object.entries(LOCATION_TYPE_LABELS) as [LocationType, string][];

const ui       = useUiStore();
const router   = useRouter();
const campaign = useCampaignStore();
const { mutateAsync: createLocation } = useCreateLocation();
const { logImageGeneration } = useImageGenerationLog();
// Mounted on every DM page — only fetch the parent-location tree once the panel opens.
const { locationOptions } = useLocationTree(() => ui.locationGeneratorOpen);
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useLocationGeneration();

const aiApiKey = computed(() => campaign.decryptedApiKey);
const isAiEnabled = computed(() => campaign.isAiEnabled);
const { isPro } = useSubscription();
const showPaywall = ref(false);

const { costOf, balance, isLoading: creditsLoading } = useAiCredits();
const { textMultiplierFor, imageMultiplierFor } = useProviderConfig();

const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok   = computed(() => !!campaign.decryptedApiKey);
const imageIsByok  = computed(() => !!campaign.decryptedOpenAiKey);

const effectiveCreditCost = computed(() => {
  let cost = textIsByok.value
    ? 0
    : Math.round(costOf("location_generation") * textMultiplierFor(textProvider.value) * 100) / 100;
  // Scene + map are each a separate entity_image charge (square → 1.0×).
  if (!imageIsByok.value) {
    const perImage = Math.round(costOf("entity_image", { size: "1024x1024" }) * imageMultiplierFor("openai") * 100) / 100;
    if (generateImage.value) cost += perImage;
    if (generateMap.value)   cost += perImage;
  }
  return cost;
});

const canAfford  = computed(() => creditsLoading.value || (balance.value ?? 0) >= effectiveCreditCost.value);
const creditLine = computed(() => {
  const cost = parseFloat(effectiveCreditCost.value.toFixed(2));
  const bal  = parseFloat(((balance.value ?? 0) as number).toFixed(2));
  return `${cost === 1 ? "1 credit" : `${cost} credits`} · Balance: ${bal}`;
});

const concept          = ref("");
const constraints      = reactive({ location_type: "" });
const parentLocationId = ref("");
const parentLocation   = computed(() => locationOptions.value.find((l) => l.id === parentLocationId.value) ?? null);
const generateImage    = ref(true);
const generateMap      = ref(false);

async function generateAndCreate() {
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

  const location = await createLocation({
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
  router.push(`/locations/${location.id}`);
}
</script>
