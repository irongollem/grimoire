<template>
  <GeneratorPanelShell
    v-model:open="ui.speciesGeneratorOpen"
    v-model:concept="concept"
    v-model:generate-image="generateImage"
    title="Species Generator"
    concept-placeholder="A people of ash and ember who walk the cooled lava fields of the Smoulder Coast, quiet, warm to the touch, and wary of rain…"
    :credits="textCreditCost"
    :byok="textIsByok"
    :is-generating="isGenerating"
    :error="genError"
    blank-to="/species/new"
    blank-label="New Blank Species"
    image-toggle-label="Generate species portrait"
    @generate="generateAndCreate"
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
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCreateSpecies } from "@/composables/rules/useSpecies";
import GeneratorPanelShell from "@/components/common/GeneratorPanelShell.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useSpeciesGeneration } from "@/ai/useSpeciesGeneration";
import { SPECIES_SIZES } from "@/lib/codex/speciesAi";
import type { SpeciesSize } from "@/types/species.types";
import { wholeCredits } from "@edge-shared/credit-math.ts";

const ui = useUiStore();
const router = useRouter();
const campaign = useCampaignStore();
const { mutateAsync: createSpecies } = useCreateSpecies();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useSpeciesGeneration();

const { canSpend } = useGenerationGate();

const { costOf } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => wholeCredits(costOf("species_generation") * textMultiplierFor(textProvider.value)),
);

const concept = ref("");
const size = ref<SpeciesSize | "">("");
const generateImage = ref(true);

async function generateAndCreate() {
  if (!canSpend(textCreditCost.value, textIsByok.value)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();

  const draft = await generate(concept.value.trim(), {
    size: size.value || undefined,
    generateImage: generateImage.value,
  });
  if (!draft) return;

  const species = await createSpecies(draft);

  completedEntityId.value = species.id;
  ui.speciesGeneratorOpen = false;
  router.push(`/species/${species.id}`);
}
</script>
