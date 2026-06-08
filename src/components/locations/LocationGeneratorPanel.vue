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
        <h2 class="font-cinzel text-base font-semibold text-foreground">Location Generator</h2>
        <button class="text-muted-foreground hover:text-foreground" @click="ui.locationGeneratorOpen = false">
          <IconClose class="h-5 w-5" />
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-5">
        <!-- Concept -->
        <div>
          <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">
            CONCEPT
            <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(AI will use this)</span>
          </label>
          <textarea
            v-model="concept"
            rows="4"
            :maxlength="CONCEPT_LIMIT"
            placeholder="A crumbling dwarven forge district deep beneath the mountain, long abandoned after a cave-in sealed the lower tunnels and the forgemasters never returned…"
            class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <div class="flex justify-end mt-1">
            <span
              class="font-fell text-xs"
              :class="concept.length >= CONCEPT_LIMIT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
            >{{ concept.length }} / {{ CONCEPT_LIMIT }}</span>
          </div>
        </div>

        <div class="gold-divider" />

        <!-- Constraints -->
        <div class="space-y-3">
          <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">
            CONSTRAINTS
            <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(optional)</span>
          </p>

          <div class="space-y-2">
            <div>
              <label class="block font-fell text-xs text-muted-foreground mb-1">Location Type</label>
              <select
                v-model="constraints.location_type"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Any</option>
                <option v-for="[value, label] in TYPE_OPTIONS" :key="value" :value="value">{{ label }}</option>
              </select>
            </div>
            <div>
              <label class="block font-fell text-xs text-muted-foreground mb-1">Parent Location</label>
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
            <span class="font-fell text-xs text-muted-foreground">Generate location art</span>
            <button
              type="button"
              class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
              :class="generateImage ? 'bg-primary' : 'bg-muted border border-border'"
              @click="generateImage = !generateImage"
            >
              <span
                class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm"
                :class="generateImage ? 'translate-x-4.5' : 'translate-x-0.5'"
              />
            </button>
          </div>
          <div class="flex items-center justify-between">
            <span class="font-fell text-xs text-muted-foreground">Generate map sketch</span>
            <button
              type="button"
              class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
              :class="generateMap ? 'bg-primary' : 'bg-muted border border-border'"
              @click="generateMap = !generateMap"
            >
              <span
                class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm"
                :class="generateMap ? 'translate-x-4.5' : 'translate-x-0.5'"
              />
            </button>
          </div>
        </div>

        <!-- No API key nudge -->
        <!-- Generating state -->
        <div v-else-if="isGenerating" class="flex flex-col items-center gap-3 py-4">
          <IconGenerate class="h-7 w-7 text-primary animate-pulse" />
          <p class="font-fell text-sm text-muted-foreground italic text-center">{{ currentLoadingQuote }}</p>
          <button
            type="button"
            class="mt-1 font-fell text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            @click="ui.locationGeneratorOpen = false"
          >
            Continue in background
          </button>
        </div>

        <!-- Error -->
        <div
          v-else-if="genError"
          class="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2"
        >
          <p class="font-fell text-xs text-destructive">{{ genError }}</p>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-5 py-4 border-t border-border flex flex-col gap-2 shrink-0">
        <p
          v-if="effectiveCreditCost > 0 && isPro && isAiEnabled"
          class="font-fell text-xs text-center"
          :class="canAfford ? 'text-muted-foreground' : 'text-destructive font-semibold'"
        >{{ creditLine }}</p>
        <button
          v-if="isPro && isAiEnabled"
          type="button"
          :disabled="isAnyAiGenerating || !concept.trim() || (effectiveCreditCost > 0 && !canAfford)"
          :title="isAnyAiGenerating && !isGenerating ? 'Another generation is already in progress' : undefined"
          class="w-full inline-flex items-center justify-center gap-1.5 py-2 font-cinzel text-xs font-semibold tracking-wider rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          @click="generateAndCreate"
        >
          <IconGenerate class="h-3.5 w-3.5" />
          {{ isGenerating ? "Generating…" : "Generate with AI" }}
        </button>
        <button
          v-else-if="!isPro"
          type="button"
          class="w-full inline-flex items-center justify-center gap-1.5 py-2 font-cinzel text-xs font-semibold tracking-wider rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          @click="showPaywall = true"
        >
          <IconGenerate class="h-3.5 w-3.5" />
          Generate with AI
        </button>
        <RouterLink
          to="/locations/new"
          class="w-full inline-flex items-center justify-center py-2 font-cinzel text-xs font-semibold tracking-wider rounded-md hover:opacity-90 transition-opacity"
          :class="isPro && !aiApiKey ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground hover:bg-muted'"
          @click="ui.locationGeneratorOpen = false"
        >
          New Blank Location
        </RouterLink>
      </div>
    </aside>
  </Transition>
  <PaywallModal v-model="showPaywall" message="AI generation is a Pro feature. Upgrade to generate locations, NPCs, monsters, items, spells, and more." />
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { AI_PROMPT_LIMIT } from "@/ai/utils";

const CONCEPT_LIMIT = AI_PROMPT_LIMIT;
import { useRouter, RouterLink } from "vue-router";
import { IconClose, IconGenerate } from '@/lib/icons';
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCreateLocation, useLocationTree } from "@/composables/useLocations";
import { useImageGenerationLog } from "@/composables/useImageGenerationLog";
import { useSubscription } from "@/composables/useSubscription";
import PaywallModal from "@/components/common/PaywallModal.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
import { useLocationGeneration } from "@/ai/useLocationGeneration";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { LOCATION_TYPE_LABELS } from "@/types/location.types";
import type { LocationType } from "@/types/location.types";
import { useAiCredits } from "@/composables/useAiCredits";
import { useProviderConfig } from "@/composables/useProviderConfig";

const TYPE_OPTIONS = Object.entries(LOCATION_TYPE_LABELS) as [LocationType, string][];

const ui       = useUiStore();
const router   = useRouter();
const campaign = useCampaignStore();
const { mutateAsync: createLocation } = useCreateLocation();
const { logImageGeneration } = useImageGenerationLog();
const { locationOptions } = useLocationTree();
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
