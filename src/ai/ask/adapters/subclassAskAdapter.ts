/**
 * Ask Grimoire (#1253): the Archetype Generator (subclass), as a quote and a run.
 *
 * The price is `useSubclassQuote`'s (the one `CustomSubclassGeneratorPanel` shows), the gates are the page's
 * (`useAskGate`, which also refuses a campaign whose game system has no 5e rules), and the run is
 * `useGenerateCustomSubclass`: the archetype and its abilities, created as one. The parent class is required and is
 * matched against the classes the campaign can use (the page's own picker source, `useSubclassParents`); a class
 * that is absent or matches none blocks the quote, because the page cannot generate without one either, and the
 * subclass level comes from that class. A subclass has no picture.
 */
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { conceptBlock, failedRun, saveFailure, sameWord, spent } from "@/ai/ask/adapters/askAdapterKit";
import { useCampaignStore } from "@/stores/campaign";
import { useSubclassQuote } from "@/composables/ai/quotes/subclassQuote";
import { useGenerateCustomSubclass, useSubclassParents } from "@/composables/rules/useGenerateCustomSubclass";

export function useSubclassAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteSubclass = useSubclassQuote();
  const { blockFor } = useAskGate(null, "archetype");
  const { generateAndCreateSubclass } = useGenerateCustomSubclass();

  // The classes are read only once a subclass is proposed: this adapter lives as long as the panel, which is
  // mounted on every page, and a closed panel must cost no egress.
  const lookupsWanted = ref(false);
  const { levelByClass, loading } = useSubclassParents(() => lookupsWanted.value);

  function understand(proposal: AskProposal) {
    lookupsWanted.value = true;
    const inputs = readAskInputs("subclass", proposal.inputs);
    const named = askString(inputs, "parent_class");
    const parent = named === null ? null : [...levelByClass.value.keys()].find((name) => sameWord(name, named)) ?? null;
    const subclassLevel = parent === null ? null : levelByClass.value.get(parent) ?? null;
    return { parent, subclassLevel, concept: proposal.concept.trim() };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteSubclass();

    const lines: AskQuoteLine[] = [];
    if (read.parent) lines.push({ label: "Class", value: read.parent, credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);

    let block = blockFor({ total: priced.total, fiveE: true }) ?? conceptBlock(read.concept, "archetype");
    if (!block && loading.value) {
      block = { reason: "missing", message: "Still reading this campaign's classes." };
    } else if (!block && read.parent === null) {
      block = { reason: "missing", message: "Which class is it a subclass of?" };
    }
    return { lines, total: priced.total, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Archetype text", current.block.message);
    const read = understand(proposal);
    if (read.parent === null || read.subclassLevel === null) return failedRun("Archetype text", "Which class is it a subclass of?");

    let outcome;
    try {
      outcome = await generateAndCreateSubclass(read.concept, { parentClassName: read.parent, subclassLevel: read.subclassLevel });
    } catch (e) {
      return failedRun("Archetype text", saveFailure(e, "archetypes", "The archetype could not be saved."));
    }
    if (!outcome.id || outcome.name === null) return failedRun("Archetype text", outcome.error ?? "Archetype generation failed.");

    return {
      record: { type: "other", id: outcome.id, name: outcome.name },
      route: `/levelup/custom/${outcome.id}`,
      parts: [{ label: "Archetype text", ok: true, credits: spent(current.lines.find((l) => l.label === "Archetype text")) }],
    };
  }

  return { id: "subclass", quote, run };
}

export default useSubclassAskAdapter;
