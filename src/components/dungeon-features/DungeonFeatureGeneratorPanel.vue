<template>
  <GeneratorPanelShell
    v-model:open="generatorsUi.dungeonFeatureGeneratorOpen"
    v-model:concept="concept"
    v-model:generate-image="generateImage"
    title="Feature Generator"
    concept-placeholder="A bookcase in the abbot's study that swings aside when the wrong tome is pulled, revealing a stair down to the old crypt, and a needle trap for anyone who guesses wrong…"
    :credits="effectiveCreditCost"
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
import { useToast } from "@/composables/useToast";
import { useGenerateDungeonFeature } from "@/composables/dungeon-features/useGenerateDungeonFeature";
import { useDungeonFeatureQuote } from "@/composables/ai/quotes/dungeonFeatureQuote";
import GeneratorPanelShell from "@/components/common/ai/GeneratorPanelShell.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useRetainedGeneration } from "@/composables/ai/useRetainedGeneration";
import { useDungeonFeatureGeneration } from "@/ai/useDungeonFeatureGeneration";
import { DUNGEON_FEATURE_TYPES, DUNGEON_FEATURE_TRIGGERS } from "@/types/dungeonFeature.types";

const generatorsUi = useGeneratorUiStore();
const router   = useRouter();
const toast = useToast();
const { saveGeneratedFeature } = useGenerateDungeonFeature();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useDungeonFeatureGeneration();

// Dungeon features are not a quota-capped resource, so the gate is credits only.
const { canSpend } = useGenerationGate();

// The price is the quote's, the one Ask Grimoire shows too, so the page and Ask cannot disagree.
const quoteFeature = useDungeonFeatureQuote();

const concept       = ref("");
const constraints   = reactive({ feature_type: "", trigger_type: "" });
const generateImage = ref(true);

const quote = computed(() => quoteFeature({ image: generateImage.value }));
// Null while any part that will be charged has no known price yet.
const effectiveCreditCost = computed(() => quote.value.total);

type Generated = NonNullable<Awaited<ReturnType<typeof generate>>>;
const retained = useRetainedGeneration<Generated>();

async function onGenerate() {
  if (retained.unsaved.value) {
    await save(retained.unsaved.value);
    return;
  }
  await generateAndCreate();
}

async function generateAndCreate() {
  if (!canSpend(effectiveCreditCost.value)) return;

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
      return await saveGeneratedFeature(r, genConcept.value);
    } catch (e) {
      toast.error(toast.fromError(e));
      return null;
    }
  });
  if (!feature) return;

  completedEntityId.value = feature.id;
  generatorsUi.dungeonFeatureGeneratorOpen = false;
  router.push(`/dungeon-features/${feature.id}`);
}
</script>
