<template>
  <GeneratorPanelShell
    v-model:open="ui.backgroundGeneratorOpen"
    v-model:concept="concept"
    title="Background Generator"
    concept-placeholder="A former lamplighter of the river district who learned which windows stay dark, and why…"
    :credits="textCreditCost"
    :byok="textIsByok"
    :is-generating="isGenerating"
    :error="genError"
    blank-to="/backgrounds/new"
    blank-label="New Blank Background"
    @generate="generateAndCreate"
  >
    <template #constraints>
      <div>
        <label class="block text-caption text-muted-foreground mb-1">Skill focus</label>
        <AppSelect v-model="skillFocus" tone="filled" size="body" weight="normal" block>
          <option value="">Any</option>
          <option v-for="s in SKILLS" :key="s.key" :value="s.label">{{ s.label }}</option>
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
import { useCreateBackground } from "@/composables/rules/useBackgrounds";
import GeneratorPanelShell from "@/components/common/GeneratorPanelShell.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useBackgroundGeneration } from "@/ai/useBackgroundGeneration";
import { SKILLS } from "@/types/party.types";
import { wholeCredits } from "@edge-shared/credit-math.ts";

const ui = useUiStore();
const router = useRouter();
const campaign = useCampaignStore();
const { mutateAsync: createBackground } = useCreateBackground();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useBackgroundGeneration();

const { canSpend } = useGenerationGate();

const { costOf } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => wholeCredits(costOf("background_generation") * textMultiplierFor(textProvider.value)),
);

const concept = ref("");
const skillFocus = ref("");

async function generateAndCreate() {
  if (!canSpend(textCreditCost.value, textIsByok.value)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();

  const draft = await generate(concept.value.trim(), {
    skill_focus: skillFocus.value || undefined,
  });
  if (!draft) return;

  const background = await createBackground(draft);

  completedEntityId.value = background.id;
  ui.backgroundGeneratorOpen = false;
  router.push(`/backgrounds/${background.id}`);
}
</script>
