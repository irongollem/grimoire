/**
 * Ask Grimoire (#1253): the Encounter Generator, as a quote and a run.
 *
 * The price is `useEncounterQuote`'s (the one `EncounterGeneratorPanel` shows), the gates are the page's (`useAskGate`:
 * AI off, a game system without stat blocks, the encounters quota, the balance) and the run is `useGenerateEncounter`,
 * the resolve-and-create step the page calls. The page's version picker for a creature that exists in several
 * sourcebooks is not part of Ask: the encounter takes the resolver's pick and the DM can swap it in the editor.
 *
 * `location_id` sets the encounter in a place of this campaign (the Atlas lists an encounter at its place). The page has
 * no picker for it; Ask can name one, looked up in the campaign's own Atlas and ignored when it is not there. The Atlas
 * is read only once a proposal names a place, because this adapter lives as long as the panel.
 *
 * A creature the Bestiary does not have is not a failure of the run: the encounter is saved and its description lists
 * the creatures to add by hand, which the result says in its own part.
 */
import { computed, ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskChoices, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { askChoice, conceptBlock, failedRun, spent } from "@/ai/ask/adapters/askAdapterKit";
import { askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";
import { useEncounterQuote } from "@/composables/ai/quotes/encounterQuote";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useGenerateEncounter } from "@/composables/encounters/useGenerateEncounter";
import { isQuotaExceeded } from "@/lib/quotaError";

export function useEncounterAskAdapter(): AskAdapter {
  const quoteEncounter = useEncounterQuote();
  const { blockFor } = useAskGate("encounters", "encounter");
  const { generateAndCreateEncounter } = useGenerateEncounter();

  const lookupsWanted = ref(false);
  const { data: locations } = useAllLocations(() => lookupsWanted.value);
  const lookupsLoading = computed(() => lookupsWanted.value && locations.value === undefined);

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("encounter", proposal.inputs);
    const said = askString(inputs, "difficulty");
    const locationId = askString(inputs, "location_id");
    if (locationId !== null) lookupsWanted.value = true;
    return {
      location: locationId === null ? null : locations.value?.find((l) => l.id === locationId) ?? null,
      // The page's own default: the server resolves "auto" from the party.
      difficulty: said === null ? "auto" : said,
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal, choices?: AskChoices): AskQuote {
    const read = understand(proposal);
    const priced = quoteEncounter();

    const lines: AskQuoteLine[] = [{ label: "Difficulty", value: read.difficulty, credits: null }];
    if (read.location) lines.push({ label: "In", value: read.location.name, credits: null, choice: askChoice(choices, "location_id", true) });
    lines.push(...priced.lines);

    let block = blockFor({ total: priced.total, byok: priced.byok, fiveE: true });
    block = block ?? conceptBlock(read.concept, "encounter", { empty: "Say what this encounter is first.", limit: AI_PROMPT_LIMIT_SHORT });
    if (!block && lookupsLoading.value) block = { reason: "missing", message: "Still reading this campaign's places." };
    return { lines, total: priced.total, byok: priced.byok, block };
  }

  async function run(proposal: AskProposal, choices?: AskChoices): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal, choices);
    if (current.block) return failedRun("Encounter", current.block.message);
    const read = understand(proposal);
    // A place at no leaves the encounter unanchored, as if the proposal had not named one.
    const location = askChoice(choices, "location_id", true).on ? read.location : null;

    let outcome;
    try {
      outcome = await generateAndCreateEncounter(read.concept, { difficulty: read.difficulty, locationId: location?.id ?? null });
    } catch (e) {
      const message = isQuotaExceeded(e)
        ? "You have reached your limit of encounters on this plan."
        : e instanceof Error ? e.message : "The encounter could not be saved.";
      return failedRun("Encounter", message);
    }
    if (!outcome.id || outcome.name === null) return failedRun("Encounter", outcome.error ?? "Encounter generation failed.");

    const parts: AskRunResult["parts"] = [
      { label: "Encounter", ok: true, credits: spent(current.lines.find((l) => l.label === "Encounter")) },
    ];
    if (outcome.unmatched > 0) {
      parts.push({
        label: "Creatures",
        ok: false,
        credits: 0,
        error: `${outcome.unmatched} creature${outcome.unmatched === 1 ? " is" : "s are"} not in your Bestiary. They are listed in the description to add by hand.`,
      });
    }
    // Straight into the editor, as the page does: a generated encounter is a draft to review.
    return { record: { type: "encounter", id: outcome.id, name: outcome.name }, route: `/encounters/${outcome.id}?edit=true`, parts };
  }

  return { id: "encounter", quote, run };
}

export default useEncounterAskAdapter;
