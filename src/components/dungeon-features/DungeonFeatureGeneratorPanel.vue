<template>
  <GeneratorPanelShell
    v-model:open="ui.dungeonFeatureGeneratorOpen"
    v-model:concept="concept"
    v-model:generate-image="generateImage"
    title="Feature Generator"
    concept-placeholder="A bookcase in the abbot's study that swings aside when the wrong tome is pulled, revealing a stair down to the old crypt, and a needle trap for anyone who guesses wrong…"
    :credits="effectiveCreditCost"
    :byok="fullyByok"
    :is-generating="isGenerating"
    :unsaved-label="unsaved ? 'feature' : null"
    :is-saving="isSaving"
    :error="genError"
    blank-to="/dungeon-features/new"
    blank-label="New Blank Feature"
    image-toggle-label="Generate an illustration"
    @generate="onGenerate"
    @discard="unsaved = null"
  >
    <template #constraints>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-caption text-muted-foreground mb-1">Feature type</label>
          <AppSelect v-model="constraints.feature_type" tone="filled" size="body" weight="normal" block>
            <option value="">Any</option>
            <option v-for="t in DUNGEON_FEATURE_TYPES" :key="t" :value="t">{{ t }}</option>
          </AppSelect>
        </div>
        <div>
          <label class="block text-caption text-muted-foreground mb-1">Trigger</label>
          <AppSelect v-model="constraints.trigger_type" tone="filled" size="body" weight="normal" block>
            <option value="">Any</option>
            <option v-for="t in DUNGEON_FEATURE_TRIGGERS" :key="t" :value="t">{{ t }}</option>
          </AppSelect>
        </div>
      </div>
    </template>
  </GeneratorPanelShell>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { useRouter } from "vue-router";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { useCreateDungeonFeature } from "@/composables/dungeon-features/useDungeonFeatures";
import { useImageGenerationLog } from "@/composables/ai/useImageGenerationLog";
import GeneratorPanelShell from "@/components/common/GeneratorPanelShell.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useDungeonFeatureGeneration } from "@/ai/useDungeonFeatureGeneration";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { DUNGEON_FEATURE_TYPES, DUNGEON_FEATURE_TRIGGERS } from "@/types/dungeonFeature.types";
import { wholeCredits } from "@edge-shared/credit-math.ts";

const ui       = useUiStore();
const router   = useRouter();
const campaign = useCampaignStore();
const toast = useToast();
const { mutateAsync: createFeature } = useCreateDungeonFeature();
const { logImageGeneration } = useImageGenerationLog();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useDungeonFeatureGeneration();

// Dungeon features are not a quota-capped resource, so the gate is credits only.
const { canSpend } = useGenerationGate();

const { costOf } = useAiCredits();
const { textMultiplierFor, imageMultiplierFor } = useProviderConfig();

const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok   = computed(() => !!campaign.decryptedApiKey);
const imageIsByok  = computed(() => !!campaign.decryptedOpenAiKey);
const fullyByok    = computed(() => textIsByok.value && (!generateImage.value || imageIsByok.value));

const concept       = ref("");
const constraints   = reactive({ feature_type: "", trigger_type: "" });
const generateImage = ref(true);

const effectiveCreditCost = computed(() => {
  let cost = textIsByok.value
    ? 0
    : wholeCredits(costOf("feature_generation") * textMultiplierFor(textProvider.value));
  // The illustration is a separate entity_image charge (portrait size, 1.5x).
  if (generateImage.value && !imageIsByok.value) {
    cost += wholeCredits(costOf("entity_image", { size: "1024x1536" }) * imageMultiplierFor("openai"));
  }
  return cost;
});

type Generated = NonNullable<Awaited<ReturnType<typeof generate>>>;
// A paid result whose save failed is kept so the retry costs nothing.
const unsaved = ref<Generated | null>(null);
const isSaving = ref(false);

function prose(text: string | null): string | null {
  return text ? toTiptapJson(text) : null;
}

async function onGenerate() {
  if (unsaved.value) {
    await save(unsaved.value);
    return;
  }
  await generateAndCreate();
}

async function generateAndCreate() {
  if (!canSpend(effectiveCreditCost.value, fullyByok.value)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();

  const result = await generate(concept.value.trim(), {
    feature_type:  constraints.feature_type || undefined,
    trigger_type:  constraints.trigger_type || undefined,
    generateImage: generateImage.value,
  });

  if (!result) return;
  await save(result);
}

async function save(result: Generated) {
  // The generation is already paid for: a failed save keeps the result so the
  // DM can save it again without generating (and paying) twice.
  isSaving.value = true;
  let feature;
  try {
    feature = await createFeature({
      // Scoped to the campaign it was generated for; widened from the editor's
      // Scope control if the DM wants it everywhere.
      campaign_id:          campaign.activeCampaignId,
      name:                 result.name,
      feature_type:         result.feature_type,
      description:          prose(result.description),
      perception_dc:        result.perception_dc,
      investigation_dc:     result.investigation_dc,
      arcana_dc:            result.arcana_dc,
      trigger_type:         result.trigger_type,
      trigger_description:  result.trigger_description,
      feature_glyph:        result.feature_glyph,
      contents_description: prose(result.contents_description),
      image_url:            result.image_url,
      image_focal_point:    null,
      tags:                 result.tags,
      notes:                prose(result.notes),
      ai_provenance:        result.ai_provenance ?? null,
    });
  } catch (e) {
    unsaved.value = result;
    toast.error(toast.fromError(e));
    return;
  } finally {
    isSaving.value = false;
  }
  unsaved.value = null;

  // Log the generated illustration to the Gallery, linked back to the feature.
  if (result.image_url) {
    void logImageGeneration({
      kind: "dungeon_feature", imageUrl: result.image_url, prompt: genConcept.value,
      targetId: feature.id, targetColumn: "image_url",
    });
  }

  completedEntityId.value = feature.id;
  ui.dungeonFeatureGeneratorOpen = false;
  router.push(`/dungeon-features/${feature.id}`);
}
</script>
