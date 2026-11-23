/**
 * "Generate a house rule with AI and save it": the generation-to-create mapping `CustomRuleGeneratorPanel.vue` used
 * to own inline, extracted so Ask Grimoire (#1253) runs the same pipeline. `saveRule` is the page's save step (it
 * keeps a paid result whose save failed); `generateAndCreateRule` is generate then save in one call. A failed
 * save throws. A generated rule starts hidden from players.
 */
import { useCreateRule } from "@/composables/rules/useRules";
import { useCustomRuleGeneration, type CustomRuleGenerated, type CustomRuleGenerationOptions } from "@/ai/useCustomRuleGeneration";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";

export interface GenerateRuleOutcome {
  id: string | null;
  name: string | null;
  error: string | null;
}

export function useGenerateCustomRule() {
  const { mutateAsync: createRule } = useCreateRule();
  const generation = useCustomRuleGeneration();

  function saveRule(r: CustomRuleGenerated) {
    return createRule({
      title: r.title,
      category: r.category,
      content: r.content,
      tags: r.tags,
      is_player_visible: false,
      tracker: r.tracker,
      ai_provenance: r.ai_provenance,
    });
  }

  async function generateAndCreateRule(concept: string, options: CustomRuleGenerationOptions): Promise<GenerateRuleOutcome> {
    if (isAnyAiGenerating.value) return { id: null, name: null, error: "Another AI generation is already in progress." };
    generation.concept.value = concept;
    generation.clearCompleted();
    const draft = await generation.generate(concept, options);
    if (!draft) return { id: null, name: null, error: generation.error.value ?? "Rule generation failed." };
    const created = await saveRule(draft);
    return { id: created.id, name: draft.title, error: null };
  }

  return { generation, saveRule, generateAndCreateRule };
}
