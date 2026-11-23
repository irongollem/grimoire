/**
 * Ask Grimoire (#1253): suggested connections for an NPC, as a quote and a run that ends in the NPC's own review.
 *
 * The suggestions are `useConnectionSuggestions`' module state, stored under the subject they were asked for, so the
 * Connections block of that NPC's sheet shows them the moment it mounts: "Review suggestions" only has to open the
 * NPC. Accepting writes the tie through `useCreateConnection`, one at a time, and is the DM's alone.
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

export function useConnectionSuggestionsAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteFor = useConnectionSuggestionsQuote();
  const { blockFor } = useAskGate(null, "connection suggestion");
  const { suggest, forSubject } = useConnectionSuggestions();

  /** The NPC the proposal is about; anything else (or nothing) is no one to suggest for. */
  function subjectOf(proposal: AskProposal) {
    const target = proposal.target;
    return target && target.type === "npc" ? target : null;
  }

  function quote(proposal: AskProposal): AskQuote {
    const subject = subjectOf(proposal);
    const priced = quoteFor();
    const concept = proposal.concept.trim();

    const lines: AskQuoteLine[] = [];
    if (subject) lines.push({ label: "NPC", value: subject.name, credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    if (concept !== "") lines.push({ label: "Steer", value: concept, credits: null });
    lines.push(...priced.lines);

    let block = blockFor({ total: priced.total, byok: priced.byok });
    if (!block && subject === null) {
      block = { reason: "missing", message: "Open the NPC these are for first." };
    } else if (!block && concept.length > AI_PROMPT_LIMIT_SHORT) {
      block = { reason: "missing", message: `Shorten the steer to ${AI_PROMPT_LIMIT_SHORT} characters.` };
    }
    return { lines, total: priced.total, byok: priced.byok, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Connections", current.block.message);
    if (isAnyAiGenerating.value) return failedRun("Connections", "Another generation is already in progress.");
    const subject = subjectOf(proposal);
    if (subject === null) return failedRun("Connections", "Open the NPC these are for first.");

    const ref = { kind: "npc" as const, id: subject.id };
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
      route: `/npcs/${subject.id}`,
      parts: [{ label, ok: true, credits: current.total === null ? 0 : current.total }],
    };
  }

  return { id: "connection_suggestions", quote, run };
}

export default useConnectionSuggestionsAskAdapter;
