/**
 * Ask Grimoire (#1253): the House Rule Generator, as a quote and a run.
 *
 * The price is `useHouseRuleQuote`'s (the one `CustomRuleGeneratorPanel` shows), the gates are the page's
 * (`useAskGate`; a house rule is not 5e-only), and the run is `useGenerateCustomRule`, which saves it hidden from
 * players like the page does. The category is matched against the page's own list; a word it does not offer is not
 * understood. The page's "Allow a tracker" switch is on by default, so it is on here. A rule has no picture.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { conceptBlock, failedRun, matchOption, saveFailure, spent } from "@/ai/ask/adapters/askAdapterKit";
import { useCampaignStore } from "@/stores/campaign";
import { useHouseRuleQuote } from "@/composables/ai/quotes/houseRuleQuote";
import { useGenerateCustomRule } from "@/composables/rules/useGenerateCustomRule";
import { RULE_CATEGORIES } from "@/types/rule.types";

const CATEGORIES = RULE_CATEGORIES.map((c) => ({ id: c, label: c }));

export function useHouseRuleAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteRule = useHouseRuleQuote();
  const { blockFor } = useAskGate(null, "rule");
  const { generateAndCreateRule } = useGenerateCustomRule();

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("house_rule", proposal.inputs);
    return {
      category: matchOption(askString(inputs, "category"), CATEGORIES),
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteRule();

    const lines: AskQuoteLine[] = [];
    if (read.category) lines.push({ label: "Category", value: read.category, credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);

    const block = blockFor({ total: priced.total }) ?? conceptBlock(read.concept, "rule");
    return { lines, total: priced.total, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Rule text", current.block.message);
    const read = understand(proposal);

    let outcome;
    try {
      outcome = await generateAndCreateRule(read.concept, { category: read.category ?? undefined, allowTracker: true });
    } catch (e) {
      return failedRun("Rule text", saveFailure(e, "rules", "The rule could not be saved."));
    }
    if (!outcome.id || outcome.name === null) return failedRun("Rule text", outcome.error ?? "Rule generation failed.");

    return {
      record: { type: "other", id: outcome.id, name: outcome.name },
      route: `/rules/${outcome.id}`,
      parts: [{ label: "Rule text", ok: true, credits: spent(current.lines.find((l) => l.label === "Rule text")) }],
    };
  }

  return { id: "house_rule", quote, run };
}

export default useHouseRuleAskAdapter;
