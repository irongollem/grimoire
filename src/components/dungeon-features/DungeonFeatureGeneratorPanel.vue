<template>
  <GeneratorPanelShell
    v-model:open="generatorsUi.dungeonFeatureGeneratorOpen"
    v-model:concept="concept"
    v-model:generate-image="generateImage"
    title="Feature Generator"
    concept-placeholder="A bookcase in the abbot's study that swings aside when the wrong tome is pulled, revealing a stair down to the old crypt, and a needle trap for anyone who guesses wrong…"
    :credits="effectiveCreditCost"
    :byok="fullyByok"
    :is-generating="isGenerating"
    :unsaved-label="retained.unsaved.value ? 'feature' : null"
    :is-saving="retained.isSaving.value"
    :error="genError"
    blank-to="/dungeon-features/new"
    blank-label="New Blank Feature"
    image-toggle-label="Generate an illustration"
    @generate="onGenerate"
    @discard="retained.clear()"
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
import { useGeneratorUiStore } from "@/stores/ui/generators";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { useCreateDungeonFeature } from "@/composables/dungeon-features/useDungeonFeatures";
import { useImageGenerationLog } from "@/composables/ai/useImageGenerationLog";
import GeneratorPanelShell from "@/components/common/GeneratorPanelShell.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useRetainedGeneration } from "@/composables/ai/useRetainedGeneration";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { useDungeonFeatureGeneration } from "@/ai/useDungeonFeatureGeneration";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { DUNGEON_FEATURE_TYPES, DUNGEON_FEATURE_TRIGGERS } from "@/types/dungeonFeature.types";

const generatorsUi = useGeneratorUiStore();
const router   = useRouter();
const campaign = useCampaignStore();
const toast = useToast();
const { mutateAsync: createFeature } = useCreateDungeonFeature();
const { logImageGeneration } = useImageGenerationLog();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useDungeonFeatureGeneration();

// Dungeon features are not a quota-capped resource, so the gate is credits only.
const { canSpend } = useGenerationGate();

const { costOf } = useAiCredits();
const { textCredits, textIsByok, imageCredits, imageIsByok } = useCampaignProviders();

const fullyByok    = computed(() => textIsByok.value && (!generateImage.value || imageIsByok.value));

const concept       = ref("");
const constraints   = reactive({ feature_type: "", trigger_type: "" });
const generateImage = ref(true);

// Null while any part that will be charged has no known price yet.
const effectiveCreditCost = computed<number | null>(() => {
  let cost = textIsByok.value
    ? 0
    : textCredits(costOf("feature_generation"));
  if (cost === null) return null;
  // The illustration is a separate entity_image charge (portrait size, 1.5x).
  if (generateImage.value && !imageIsByok.value) {
    const image = imageCredits(costOf("entity_image", { size: "1024x1536" }));
    if (image === null) return null;
    cost += image;
  }
  return cost;
});

type Generated = NonNullable<Awaited<ReturnType<typeof generate>>>;
const retained = useRetainedGeneration<Generated>();

function prose(text: string | null): string | null {
  return text ? toTiptapJson(text) : null;
}

async function onGenerate() {
  if (retained.unsaved.value) {
    await save(retained.unsaved.value);
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
  const feature = await retained.run(result, async (r) => {
    try {
      return await createFeature({
        // Scoped to the campaign it was generated for; widened from the editor's
        // Scope control if the DM wants it everywhere.
        campaign_id:          campaign.activeCampaignId,
        name:                 r.name,
        feature_type:         r.feature_type,
        description:          prose(r.description),
        perception_dc:        r.perception_dc,
        investigation_dc:     r.investigation_dc,
        arcana_dc:            r.arcana_dc,
        trigger_type:         r.trigger_type,
        trigger_description:  r.trigger_description,
        feature_glyph:        r.feature_glyph,
        contents_description: prose(r.contents_description),
        image_url:            r.image_url,
        image_focal_point:    null,
        tags:                 r.tags,
        notes:                prose(r.notes),
        ai_provenance:        r.ai_provenance ?? null,
      });
    } catch (e) {
      toast.error(toast.fromError(e));
      return null;
    }
  });
  if (!feature) return;

  // Log the generated illustration to the Gallery, linked back to the feature.
  if (result.image_url) {
    void logImageGeneration({
      kind: "dungeon_feature", imageUrl: result.image_url, prompt: genConcept.value,
      targetId: feature.id, targetColumn: "image_url",
    });
  }

  completedEntityId.value = feature.id;
  generatorsUi.dungeonFeatureGeneratorOpen = false;
  router.push(`/dungeon-features/${feature.id}`);
}
</script>
