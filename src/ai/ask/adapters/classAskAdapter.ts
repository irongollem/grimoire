/**
 * Ask Grimoire (#1253): the Class Generator, as a quote and a run.
 *
 * The price is `useClassQuote`'s (the one `CustomClassGeneratorPanel` shows), the gates are the page's
 * (`useAskGate`, which also refuses a campaign whose game system has no 5e rules), and the run is
 * `useGenerateCustomClass`: the class and its abilities, created as one (a failed write removes the abilities
 * already made). The page shows "this will create" before writing; the quote is Ask's version of that step. The
 * hit die is matched against the page's own dice; a value it does not offer is not understood. A class has no
 * picture.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { askInteger, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { conceptBlock, failedRun, saveFailure, spent } from "@/ai/ask/adapters/askAdapterKit";
import { useCampaignStore } from "@/stores/campaign";
import { useClassQuote } from "@/composables/ai/quotes/classQuote";
import { useGenerateCustomClass } from "@/composables/rules/useGenerateCustomClass";
import { HIT_DICE } from "@/lib/codex/classAi";
import type { HitDie } from "@/levelup/customTypes";

export function useClassAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteClass = useClassQuote();
  const { blockFor } = useAskGate(null, "class");
  const { generateAndCreateClass } = useGenerateCustomClass();

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("class", proposal.inputs);
    const die = askInteger(inputs, "hit_die");
    const hitDie: HitDie | null = HIT_DICE.find((d) => d === die) ?? null;
    return { hitDie, concept: proposal.concept.trim() };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteClass();

    const lines: AskQuoteLine[] = [];
    if (read.hitDie) lines.push({ label: "Hit die", value: `d${read.hitDie}`, credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);

    const block = blockFor({ total: priced.total, byok: priced.byok, fiveE: true }) ?? conceptBlock(read.concept, "class");
    return { lines, total: priced.total, byok: priced.byok, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Class text", current.block.message);
    const read = understand(proposal);

    let outcome;
    try {
      outcome = await generateAndCreateClass(read.concept, { hitDie: read.hitDie ?? undefined });
    } catch (e) {
      return failedRun("Class text", saveFailure(e, "classes", "The class could not be saved."));
    }
    if (!outcome.id || outcome.name === null) return failedRun("Class text", outcome.error ?? "Class generation failed.");

    const parts: AskRunPart[] = [{ label: "Class text", ok: true, credits: spent(current.lines.find((l) => l.label === "Class text")) }];
    // Left out of the class without stopping it (the official Ability Score Improvement missing): the DM should know.
    for (const warning of outcome.warnings) parts.push({ label: "Note", ok: false, credits: 0, error: warning });
    return { record: { type: "other", id: outcome.id, name: outcome.name }, route: `/levelup/classes/${outcome.id}`, parts };
  }

  return { id: "class", quote, run };
}

export default useClassAskAdapter;
