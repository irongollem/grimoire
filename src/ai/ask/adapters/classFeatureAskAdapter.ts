/**
 * Ask Grimoire (#1253): the Ability Generator (class feature), as a quote and a run.
 *
 * The price is `useClassFeatureQuote`'s (the one `ClassFeatureGeneratorPanel` shows), the gates are the page's
 * (`useAskGate`, which also refuses a campaign whose game system has no 5e rules), and the run is
 * `useGenerateClassFeature`. "How it is used" is matched against the page's own activations; a word it does not
 * offer is not understood. An ability has no picture.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { conceptBlock, failedRun, matchOption, saveFailure, spent } from "@/ai/ask/adapters/askAdapterKit";
import { useCampaignStore } from "@/stores/campaign";
import { useClassFeatureQuote } from "@/composables/ai/quotes/classFeatureQuote";
import { useGenerateClassFeature } from "@/composables/rules/useGenerateClassFeature";
import { ACTIVATIONS } from "@/rules/features/mechanics.types";
import { ACTIVATION_LABELS } from "@/types/feature.types";

const ACTIVATION_OPTIONS = ACTIVATIONS.map((a) => ({ id: a, label: ACTIVATION_LABELS[a] }));

export function useClassFeatureAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteFeature = useClassFeatureQuote();
  const { blockFor } = useAskGate(null, "ability");
  const { generateAndCreateClassFeature } = useGenerateClassFeature();

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("class_feature", proposal.inputs);
    return {
      activation: matchOption(askString(inputs, "activation"), ACTIVATION_OPTIONS),
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteFeature();

    const lines: AskQuoteLine[] = [];
    if (read.activation) lines.push({ label: "How it is used", value: ACTIVATION_LABELS[read.activation], credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);

    const block = blockFor({ total: priced.total, fiveE: true }) ?? conceptBlock(read.concept, "ability");
    return { lines, total: priced.total, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Ability text", current.block.message);
    const read = understand(proposal);

    let outcome;
    try {
      outcome = await generateAndCreateClassFeature(read.concept, { activation: read.activation ?? undefined });
    } catch (e) {
      return failedRun("Ability text", saveFailure(e, "abilities", "The ability could not be saved."));
    }
    if (!outcome.id || outcome.name === null) return failedRun("Ability text", outcome.error ?? "Ability generation failed.");

    return {
      record: { type: "other", id: outcome.id, name: outcome.name },
      route: `/features/${outcome.id}`,
      parts: [{ label: "Ability text", ok: true, credits: spent(current.lines.find((l) => l.label === "Ability text")) }],
    };
  }

  return { id: "class_feature", quote, run };
}

export default useClassFeatureAskAdapter;
