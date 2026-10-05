<template>
  <GeneratorPanelShell
    v-model:open="ui.classFeatureGeneratorOpen"
    v-model:concept="concept"
    title="Ability Generator"
    concept-placeholder="A ranger's trick for turning a fallen tree into cover in a single breath, usable a few times between rests…"
    :credits="textCreditCost"
    :byok="textIsByok"
    :is-generating="isGenerating"
    :unsaved-label="retained.unsaved.value ? 'feature' : null"
    :is-saving="retained.isSaving.value"
    :error="genError"
    blank-to="/features/new"
    blank-label="New Blank Ability"
    @generate="onGenerate"
    @discard="retained.clear()"
  >
    <template #constraints>
      <div>
        <label class="block text-caption text-muted-foreground mb-1">How it is used</label>
        <AppSelect v-model="activation" tone="filled" size="body" weight="normal" block>
          <option value="">Any</option>
          <option v-for="a in ACTIVATIONS" :key="a" :value="a">{{ ACTIVATION_LABELS[a] }}</option>
        </AppSelect>
      </div>
      <div>
        <label class="block text-caption text-muted-foreground mb-1">For which class or species (optional)</label>
        <AppInput v-model="forWhom" tone="filled" size="body" placeholder="Ranger, Dwarf, Emberwarden…" />
      </div>
    </template>
  </GeneratorPanelShell>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { useCreateFeature } from "@/composables/rules/useFeatures";
import GeneratorPanelShell from "@/components/common/GeneratorPanelShell.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import AppInput from "@/components/common/AppInput.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useRetainedGeneration } from "@/composables/ai/useRetainedGeneration";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useClassFeatureGeneration } from "@/ai/useClassFeatureGeneration";
import { ACTIVATIONS, type Activation } from "@/rules/features/mechanics.types";
import { ACTIVATION_LABELS } from "@/types/feature.types";
import { wholeCredits } from "@edge-shared/credit-math.ts";

const ui = useUiStore();
const router = useRouter();
const campaign = useCampaignStore();
const toast = useToast();
const { mutateAsync: createFeature } = useCreateFeature();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useClassFeatureGeneration();

const { canSpend } = useGenerationGate();

const { costOf } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => wholeCredits(costOf("class_feature_generation") * textMultiplierFor(textProvider.value)),
);

type Generated = NonNullable<Awaited<ReturnType<typeof generate>>>;
const retained = useRetainedGeneration<Generated>();

const concept = ref("");
const activation = ref<Activation | "">("");
const forWhom = ref("");

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
    activation: activation.value || undefined,
    forWhom: forWhom.value,
  });
  if (!draft) return;
  await save(draft);
}

async function save(draft: Generated) {
  // The generation is already paid for: a failed save keeps the result so the
  // DM can save it again without generating (and paying) twice.
  const feature = await retained.run(draft, async (r) => {
    try {
      return await createFeature(r);
    } catch (e) {
      toast.error(toast.fromError(e));
      return null;
    }
  });
  if (!feature) return;

  completedEntityId.value = feature.id;
  ui.classFeatureGeneratorOpen = false;
  router.push(`/features/${feature.id}`);
}
</script>
