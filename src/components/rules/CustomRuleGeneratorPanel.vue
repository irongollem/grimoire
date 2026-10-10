<template>
  <GeneratorPanelShell
    v-model:open="generatorsUi.customRuleGeneratorOpen"
    v-model:concept="concept"
    title="House Rule Generator"
    concept-placeholder="Sanity: characters who witness horrors lose Lucidity, and at low Lucidity they struggle to act. Rest and calming rituals restore it…"
    :credits="textCreditCost"
    :byok="textIsByok"
    :is-generating="isGenerating"
    :unsaved-label="retained.unsaved.value ? 'rule' : null"
    :is-saving="retained.isSaving.value"
    :error="genError"
    blank-to="/rules/new"
    blank-label="New Blank Rule"
    @generate="onGenerate"
    @discard="retained.clear()"
  >
    <template #constraints>
      <div>
        <label class="block text-caption text-muted-foreground mb-1">Category</label>
        <AppSelect v-model="constraints.category" tone="filled" size="body" weight="normal" block>
          <option value="">Any</option>
          <option v-for="c in RULE_CATEGORIES" :key="c" :value="c">{{ c }}</option>
        </AppSelect>
      </div>
      <div class="flex items-center justify-between gap-3">
        <span class="text-caption text-muted-foreground">Allow a tracker</span>
        <ToggleSwitch v-model="constraints.allowTracker" aria-label="Allow a tracker" />
      </div>
    </template>
  </GeneratorPanelShell>
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { useRouter } from "vue-router";
import { useGeneratorUiStore } from "@/stores/ui/generators";
import { useToast } from "@/composables/useToast";
import { useCreateRule } from "@/composables/rules/useRules";
import GeneratorPanelShell from "@/components/common/ai/GeneratorPanelShell.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import ToggleSwitch from "@/components/common/controls/ToggleSwitch.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useRetainedGeneration } from "@/composables/ai/useRetainedGeneration";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { useCustomRuleGeneration } from "@/ai/useCustomRuleGeneration";
import { RULE_CATEGORIES } from "@/types/rule.types";

const generatorsUi = useGeneratorUiStore();
const router = useRouter();
const toast = useToast();
const { mutateAsync: createRule } = useCreateRule();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useCustomRuleGeneration();

const { canSpend } = useGenerationGate();

const { costOf } = useAiCredits();
const { textCredits, textIsByok } = useCampaignProviders();
const textCreditCost = computed(
  () => textCredits(costOf("custom_rule_generation")),
);

type Generated = NonNullable<Awaited<ReturnType<typeof generate>>>;
const retained = useRetainedGeneration<Generated>();

const concept = ref("");
const constraints = reactive({ category: "", allowTracker: true });

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

  const result = await generate(concept.value.trim(), {
    category: constraints.category || undefined,
    allowTracker: constraints.allowTracker,
  });
  if (!result) return;
  await save(result);
}

async function save(result: Generated) {
  // The generation is already paid for: a failed save keeps the result so the
  // DM can save it again without generating (and paying) twice.
  const rule = await retained.run(result, async (r) => {
    try {
      return await createRule({
        title: r.title,
        category: r.category,
        content: r.content,
        tags: r.tags,
        is_player_visible: false,
        tracker: r.tracker,
        ai_provenance: r.ai_provenance,
      });
    } catch (e) {
      toast.error(toast.fromError(e));
      return null;
    }
  });
  if (!rule) return;

  completedEntityId.value = rule.id;
  generatorsUi.customRuleGeneratorOpen = false;
  router.push(`/rules/${rule.id}`);
}
</script>
