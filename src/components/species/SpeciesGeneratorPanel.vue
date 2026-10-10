<template>
  <GeneratorPanelShell
    v-model:open="generatorsUi.speciesGeneratorOpen"
    v-model:concept="concept"
    v-model:generate-image="generateImage"
    title="Species Generator"
    concept-placeholder="A people of ash and ember who walk the cooled lava fields of the Smoulder Coast, quiet, warm to the touch, and wary of rain…"
    :credits="textCreditCost"
    :byok="textIsByok"
    :is-generating="isGenerating"
    :unsaved-label="retained.unsaved.value ? 'species' : null"
    :is-saving="retained.isSaving.value"
    :error="genError"
    blank-to="/species/new"
    blank-label="New Blank Species"
    image-toggle-label="Generate species portrait"
    @generate="onGenerate"
    @discard="retained.clear()"
  >
    <template #constraints>
      <div>
        <label class="block text-caption text-muted-foreground mb-1">Size</label>
        <AppSelect v-model="size" tone="filled" size="body" weight="normal" block>
          <option value="">Any</option>
          <option v-for="s in SPECIES_SIZES" :key="s" :value="s" class="capitalize">{{ s }}</option>
        </AppSelect>
      </div>
    </template>
  </GeneratorPanelShell>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useGeneratorUiStore } from "@/stores/ui/generators";
import { useToast } from "@/composables/useToast";
import { useCreateSpecies } from "@/composables/rules/useSpecies";
import GeneratorPanelShell from "@/components/common/ai/GeneratorPanelShell.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useRetainedGeneration } from "@/composables/ai/useRetainedGeneration";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { useSpeciesGeneration } from "@/ai/useSpeciesGeneration";
import { SPECIES_SIZES } from "@/lib/codex/speciesAi";
import type { SpeciesSize } from "@/types/species.types";

const generatorsUi = useGeneratorUiStore();
const router = useRouter();
const toast = useToast();
const { mutateAsync: createSpecies } = useCreateSpecies();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useSpeciesGeneration();

const { canSpend } = useGenerationGate();

const { costOf } = useAiCredits();
const { textCredits, textIsByok } = useCampaignProviders();
const textCreditCost = computed(
  () => textCredits(costOf("species_generation")),
);

type Generated = NonNullable<Awaited<ReturnType<typeof generate>>>;
const retained = useRetainedGeneration<Generated>();

const concept = ref("");
const size = ref<SpeciesSize | "">("");
const generateImage = ref(true);

async function onGenerate() {
  if (retained.unsaved.value) {
    await save(retained.unsaved.value);
    return;
  }
  await generateAndCreate();
}

async function generateAndCreate() {
  if (!canSpend(textCreditCost.value, textIsByok.value)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();

  const draft = await generate(concept.value.trim(), {
    size: size.value || undefined,
    generateImage: generateImage.value,
  });
  if (!draft) return;
  await save(draft);
}

async function save(draft: Generated) {
  // The generation is already paid for: a failed save keeps the result so the
  // DM can save it again without generating (and paying) twice.
  const species = await retained.run(draft, async (r) => {
    try {
      return await createSpecies(r);
    } catch (e) {
      toast.error(toast.fromError(e));
      return null;
    }
  });
  if (!species) return;

  completedEntityId.value = species.id;
  generatorsUi.speciesGeneratorOpen = false;
  router.push(`/species/${species.id}`);
}
</script>
