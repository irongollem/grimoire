/**
 * Ask Grimoire (#1253): the Background Generator, as a quote and a run.
 *
 * The price is `useBackgroundQuote`'s (the one `BackgroundGeneratorPanel` shows), the gates are the page's
 * (`useAskGate`, which also refuses a campaign whose game system has no 5e rules), and the run is
 * `useGenerateBackground`. The skill focus is matched against the page's own skill list; a word it does not offer is
 * not understood. A background has no picture.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { conceptBlock, failedRun, matchOption, saveFailure, spent } from "@/ai/ask/adapters/askAdapterKit";
import { useCampaignStore } from "@/stores/campaign";
import { useBackgroundQuote } from "@/composables/ai/quotes/backgroundQuote";
import { useGenerateBackground } from "@/composables/rules/useGenerateBackground";
import { SKILLS } from "@/types/party.types";

// The page's picker sends the skill's label ("Insight") as the constraint, so the label is what is passed on.
const SKILL_OPTIONS = SKILLS.map((s) => ({ id: s.label, label: s.key }));

export function useBackgroundAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteBackground = useBackgroundQuote();
  const { blockFor } = useAskGate(null, "background");
  const { generateAndCreateBackground } = useGenerateBackground();

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("background", proposal.inputs);
    return {
      skillFocus: matchOption(askString(inputs, "skill_focus"), SKILL_OPTIONS),
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteBackground();

    const lines: AskQuoteLine[] = [];
    if (read.skillFocus) lines.push({ label: "Skill focus", value: read.skillFocus, credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);

    const block = blockFor({ total: priced.total, fiveE: true }) ?? conceptBlock(read.concept, "background");
    return { lines, total: priced.total, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Background text", current.block.message);
    const read = understand(proposal);

    let outcome;
    try {
      outcome = await generateAndCreateBackground(read.concept, { skill_focus: read.skillFocus ?? undefined });
    } catch (e) {
      return failedRun("Background text", saveFailure(e, "backgrounds", "The background could not be saved."));
    }
    if (!outcome.id || outcome.name === null) return failedRun("Background text", outcome.error ?? "Background generation failed.");

    return {
      record: { type: "other", id: outcome.id, name: outcome.name },
      route: `/backgrounds/${outcome.id}`,
      parts: [{ label: "Background text", ok: true, credits: spent(current.lines.find((l) => l.label === "Background text")) }],
    };
  }

  return { id: "background", quote, run };
}

export default useBackgroundAskAdapter;
