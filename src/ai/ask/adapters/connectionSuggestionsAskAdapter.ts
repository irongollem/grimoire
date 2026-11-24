/**
 * Ask Grimoire (#1253, #1270): suggested connections for a record, as a quote and a run that ends in the record's own review.
 *
 * The Suggest button of a Connections block opens this card with its record as the target (any kind a tie can join:
 * a person, a faction, a place, a deity, an item, a canon entry) and the steer as the concept. The suggestions are
 * `useConnectionSuggestions`' module state, stored under the subject they were asked for, so the Connections block of
 * that record's sheet shows them the moment it mounts: "Review suggestions" only has to open the sheet. Accepting
 * writes the tie through `useCreateConnection`, one at a time, and is the DM's alone.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { failedRun } from "@/ai/ask/adapters/askAdapterKit";
import { useAskGate } from "@/ai/ask/useAskGate";
import { countWord } from "@/ai/ask/adapters/suggestionCount";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { useConnectionSuggestions } from "@/ai/useConnectionSuggestions";
import { useCampaignStore } from "@/stores/campaign";
import { useConnectionSuggestionsQuote } from "@/composables/ai/quotes/connectionSuggestionsQuote";
import { dmSheetPath, kindNoun } from "@/lib/worldWeb/kinds";
import { LINK_KINDS, type LinkKind } from "@edge-shared/worldLinkCatalogue.ts";

export function useConnectionSuggestionsAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteFor = useConnectionSuggestionsQuote();
  const { blockFor } = useAskGate(null, "connection suggestion");
  const { suggest, forSubject } = useConnectionSuggestions();

  /** The record the proposal is about, when it is a kind a tie can join; anything else (a quest, nothing) is no one to suggest for. */
  function subjectOf(proposal: AskProposal): { kind: LinkKind; id: string; name: string } | null {
    const target = proposal.target;
    const kind = target === undefined ? undefined : LINK_KINDS.find((k) => k === target.type);
    return target && kind ? { kind, id: target.id, name: target.name } : null;
  }

  function quote(proposal: AskProposal): AskQuote {
    const subject = subjectOf(proposal);
    const priced = quoteFor();
    const concept = proposal.concept.trim();

    const lines: AskQuoteLine[] = [];
    if (subject) lines.push({ label: kindNoun(subject.kind), value: subject.name, credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    if (concept !== "") lines.push({ label: "Steer", value: concept, credits: null });
    lines.push(...priced.lines);

    let block = blockFor({ total: priced.total });
    if (!block && subject === null) {
      block = { reason: "missing", message: "Open the record these are for first." };
    } else if (!block && concept.length > AI_PROMPT_LIMIT_SHORT) {
      block = { reason: "missing", message: `Shorten the steer to ${AI_PROMPT_LIMIT_SHORT} characters.` };
    }
    return { lines, total: priced.total, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Connections", current.block.message);
    if (isAnyAiGenerating.value) return failedRun("Connections", "Another generation is already in progress.");
    const subject = subjectOf(proposal);
    if (subject === null) return failedRun("Connections", "Open the record these are for first.");

    const ref = { kind: subject.kind, id: subject.id };
    const mine = forSubject(() => ref);
    try {
      const ok = await suggest(ref, proposal.concept);
      if (!ok) return failedRun("Connections", mine.error.value ?? "The suggestions could not be written.");
    } catch (e) {
      return failedRun("Connections", e instanceof Error ? e.message : "The suggestions could not be written.");
    }

    const made = mine.suggestions.value.length;
    // A run whose every suggestion was set aside is not charged (the server holds and releases the credits).
    if (made === 0) return failedRun("Connections", "Every suggestion was set aside, so nothing was charged. Try a different steer.");
    const label = `${countWord(made)} ${made === 1 ? "connection is" : "connections are"} ready.`;
    return {
      record: null,
      route: dmSheetPath(ref),
      parts: [{ label, ok: true, credits: current.total === null ? 0 : current.total }],
    };
  }

  return { id: "connection_suggestions", quote, run };
}

export default useConnectionSuggestionsAskAdapter;
