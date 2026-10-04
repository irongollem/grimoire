<template>
  <GeneratorPanelShell
    v-model:open="ui.customRuleGeneratorOpen"
    v-model:concept="concept"
    title="House Rule Generator"
    concept-placeholder="Sanity: characters who witness horrors lose Lucidity, and at low Lucidity they struggle to act. Rest and calming rituals restore it…"
    :credits="textCreditCost"
    :byok="textIsByok"
    :is-generating="isGenerating"
    :error="genError"
    blank-to="/rules/new"
    blank-label="New Blank Rule"
    @generate="generateAndCreate"
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
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { useCreateRule } from "@/composables/rules/useRules";
import GeneratorPanelShell from "@/components/common/GeneratorPanelShell.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useCustomRuleGeneration } from "@/ai/useCustomRuleGeneration";
import { RULE_CATEGORIES } from "@/types/rule.types";
import { wholeCredits } from "@edge-shared/credit-math.ts";

const ui = useUiStore();
const router = useRouter();
const campaign = useCampaignStore();
const toast = useToast();
const { mutateAsync: createRule } = useCreateRule();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = useCustomRuleGeneration();

const { canSpend } = useGenerationGate();

const { costOf } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => wholeCredits(costOf("custom_rule_generation") * textMultiplierFor(textProvider.value)),
);

const concept = ref("");
const constraints = reactive({ category: "", allowTracker: true });

async function generateAndCreate() {
  if (!canSpend(textCreditCost.value, textIsByok.value)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();

  const result = await generate(concept.value.trim(), {
    category: constraints.category || undefined,
    allowTracker: constraints.allowTracker,
  });
  if (!result) return;

  // The generation is already paid for: a failed save must say so, and the
  // panel stays open so the DM can retry.
  let rule;
  try {
    rule = await createRule({
      title: result.title,
      category: result.category,
      content: result.content,
      tags: result.tags,
      is_player_visible: false,
      tracker: result.tracker,
      ai_provenance: result.ai_provenance,
    });
  } catch (e) {
    toast.error(toast.fromError(e));
    return;
  }

  completedEntityId.value = rule.id;
  ui.customRuleGeneratorOpen = false;
  router.push(`/rules/${rule.id}`);
}
</script>
