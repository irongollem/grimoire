<template>
  <GeneratorPanelShell
    v-model:open="ui.backgroundGeneratorOpen"
    v-model:concept="concept"
    title="Background Generator"
    concept-placeholder="A former lamplighter of the river district who learned which windows stay dark, and why…"
    :credits="textCreditCost"
    :byok="textIsByok"
    :is-generating="isGenerating"
    :unsaved-label="unsaved ? 'background' : null"
    :is-saving="isSaving"
    :error="genError"
    blank-to="/backgrounds/new"
    blank-label="New Blank Background"
    @generate="onGenerate"
    @discard="unsaved = null"
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
import { useToast } from "@/composables/useToast";
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
const toast = useToast();
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

type Generated = NonNullable<Awaited<ReturnType<typeof generate>>>;
// A paid result whose save failed is kept so the retry costs nothing.
const unsaved = ref<Generated | null>(null);
const isSaving = ref(false);

const concept = ref("");
const skillFocus = ref("");

async function onGenerate() {
  if (unsaved.value) {
    await save(unsaved.value);
    return;
  }
  await generateAndCreate();
}

async function generateAndCreate() {
  if (!canSpend(textCreditCost.value, textIsByok.value)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();

  const draft = await generate(concept.value.trim(), {
    skill_focus: skillFocus.value || undefined,
  });
  if (!draft) return;
  await save(draft);
}

async function save(draft: Generated) {
  // The generation is already paid for: a failed save keeps the result so the
  // DM can save it again without generating (and paying) twice.
  isSaving.value = true;
  let background;
  try {
    background = await createBackground(draft);
  } catch (e) {
    unsaved.value = draft;
    toast.error(toast.fromError(e));
    return;
  } finally {
    isSaving.value = false;
  }
  unsaved.value = null;

  completedEntityId.value = background.id;
  ui.backgroundGeneratorOpen = false;
  router.push(`/backgrounds/${background.id}`);
}
</script>
