<template>
  <GeneratorPanelShell
    v-model:open="generatorsUi.backgroundGeneratorOpen"
    v-model:concept="concept"
    title="Background Generator"
    concept-placeholder="A former lamplighter of the river district who learned which windows stay dark, and why…"
    :credits="textCreditCost"
    :byok="textIsByok"
    :is-generating="isGenerating"
    :unsaved-label="retained.unsaved.value ? 'background' : null"
    :is-saving="retained.isSaving.value"
    :error="genError"
    blank-to="/backgrounds/new"
    blank-label="New Blank Background"
    @generate="onGenerate"
    @discard="retained.clear()"
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
import { useGeneratorUiStore } from "@/stores/ui/generators";
import { useToast } from "@/composables/useToast";
import { useCreateBackground } from "@/composables/rules/useBackgrounds";
import GeneratorPanelShell from "@/components/common/GeneratorPanelShell.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useRetainedGeneration } from "@/composables/ai/useRetainedGeneration";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { useBackgroundGeneration } from "@/ai/useBackgroundGeneration";
import { SKILLS } from "@/types/party.types";

const generatorsUi = useGeneratorUiStore();
const router = useRouter();
const toast = useToast();
const { mutateAsync: createBackground } = useCreateBackground();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useBackgroundGeneration();

const { canSpend } = useGenerationGate();

const { costOf } = useAiCredits();
const { textCredits, textIsByok } = useCampaignProviders();
const textCreditCost = computed(
  () => textCredits(costOf("background_generation")),
);

type Generated = NonNullable<Awaited<ReturnType<typeof generate>>>;
const retained = useRetainedGeneration<Generated>();

const concept = ref("");
const skillFocus = ref("");

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
    skill_focus: skillFocus.value || undefined,
  });
  if (!draft) return;
  await save(draft);
}

async function save(draft: Generated) {
  // The generation is already paid for: a failed save keeps the result so the
  // DM can save it again without generating (and paying) twice.
  const background = await retained.run(draft, async (r) => {
    try {
      return await createBackground(r);
    } catch (e) {
      toast.error(toast.fromError(e));
      return null;
    }
  });
  if (!background) return;

  completedEntityId.value = background.id;
  generatorsUi.backgroundGeneratorOpen = false;
  router.push(`/backgrounds/${background.id}`);
}
</script>
