/**
 * Ask Grimoire (#1253, #1270): the Archetype Generator (subclass), as a quote and a preview.
 *
 * The price is `useSubclassQuote`'s, the gates are the page's (`useAskGate`, which also refuses a campaign whose game
 * system has no 5e rules). The run is two steps (`preview`): `useGenerateCustomSubclass` generates the archetype and
 * its abilities and the card shows "what this will create", and only the DM's Create writes them. The parent class is
 * required and is the card's own pick (`parent_class`, a list of the classes the campaign can use by name, the page's
 * own picker source `useSubclassParents`); a class that is absent or matches none blocks the quote, because the page
 * cannot generate without one either, and the subclass level comes from that class. A subclass has no picture.
 */
import { ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskPreviewAdapter, AskPreviewOutcome, AskPreviewShown, AskQuote, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { conceptBlock, failedRun, saveFailure, sameWord, spent } from "@/ai/ask/adapters/askAdapterKit";
import { useCampaignStore } from "@/stores/campaign";
import { useSubclassQuote } from "@/composables/ai/quotes/subclassQuote";
import { useGenerateCustomSubclass, useSubclassParents } from "@/composables/rules/useGenerateCustomSubclass";
import type { SubclassDraft } from "@/lib/codex/subclassAi";

/** What the card shows of an archetype that is not saved yet: whose it is and the levels its abilities arrive at. */
function shownSubclass(draft: SubclassDraft): AskPreviewShown {
  const count = draft.features.length;
  const levels = [...new Set(draft.features.map((f) => f.level))];
  return {
    title: draft.base.subclass_name,
    badge: `A ${draft.base.class_name} archetype`,
    sections: [{ heading: `${count} ${count === 1 ? "ability" : "abilities"}`, rows: levels.map((level) => ({ label: `Level ${level}`, detail: String(draft.features.filter((f) => f.level === level).length) })) }],
  };
}

export function useSubclassAskAdapter(): AskPreviewAdapter {
  const campaign = useCampaignStore();
  const quoteSubclass = useSubclassQuote();
  const { blockFor } = useAskGate(null, "archetype");
  const { generateSubclassDraft, createSubclassFromDraft } = useGenerateCustomSubclass();

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

  /** Generates and holds the archetype for the DM to look at: charged here, and `create` writes what was shown for nothing more. */
  async function preview(proposal: AskProposal): Promise<AskPreviewOutcome> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return { ok: false, result: failedRun("Archetype text", current.block.message) };
    const read = understand(proposal);
    if (read.parent === null || read.subclassLevel === null) return { ok: false, result: failedRun("Archetype text", "Which class is it a subclass of?") };

    let outcome;
    try {
      outcome = await generateSubclassDraft(read.concept, { parentClassName: read.parent, subclassLevel: read.subclassLevel });
    } catch (e) {
      return { ok: false, result: failedRun("Archetype text", e instanceof Error ? e.message : "Archetype generation failed.") };
    }
    if (outcome.draft === null) return { ok: false, result: failedRun("Archetype text", outcome.error ?? "Archetype generation failed.") };
    const draft: SubclassDraft = outcome.draft;

    const parts: AskRunPart[] = [{ label: "Archetype text", ok: true, credits: spent(current.lines.find((l) => l.label === "Archetype text")) }];

    async function create(): Promise<AskRunResult> {
      let created;
      try {
        created = await createSubclassFromDraft(draft);
      } catch (e) {
        return failedRun("Archetype text", saveFailure(e, "archetypes", "The archetype could not be saved."));
      }
      return { record: { type: "other", id: created.id, name: draft.base.subclass_name }, route: `/levelup/custom/${created.id}`, parts };
    }

    return { ok: true, preview: { shown: shownSubclass(draft), parts, create } };
  }

  return { id: "subclass", quote, preview };
}

export default useSubclassAskAdapter;
