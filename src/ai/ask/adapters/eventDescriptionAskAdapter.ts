/**
 * Ask Grimoire (#1270): the calendar's Draft with AI, as a card in the Familiar that writes the open event's description.
 *
 * Same generation (`useCalendarEventGeneration`, the dialog's) with the same grounding: the date and type come from
 * the open event form (its `context`), the campaign's deities, pantheons and factions are read once the form is open.
 * Nothing is saved: the draft goes to the form the modal registered (`useAskFormFill`). The "what should the event be
 * about" box is optional; an unsteered draft asks plainly.
 */
import { computed } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteBlock, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { failedRun } from "@/ai/ask/adapters/askAdapterKit";
import { fillerOf, formClosedBlock, landInForm } from "@/ai/ask/adapters/formFillKit";
import { useAskGate } from "@/ai/ask/useAskGate";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { useCalendarEventGeneration, type CalendarEventDraft } from "@/ai/useCalendarEventGeneration";
import { useCampaignStore } from "@/stores/campaign";
import { useAskFormFillStore } from "@/stores/ui/askFormFill";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { useAllDeities, useAllPantheons } from "@/composables/deities/useDeities";
import { useAllFactions } from "@/composables/factions/useFactions";
import { buildCalendarEventConstraints } from "@/lib/calendar/eventGeneration";

const ID = "event_description";
const FORM = "event";
const CONCEPT_MAX = 1000;

/** What the open event form tells the card: the date as the DM reads it and the type picked in the form. */
export interface EventFormContext {
  dateLabel: string;
  eventType: string;
}

export function useEventDescriptionAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const store = useAskFormFillStore();
  const { blockFor } = useAskGate(null, "event");
  const { costOf } = useAiCredits();
  const { textCredits } = useCampaignProviders();
  const { generate, error } = useCalendarEventGeneration();

  // The grounding is read only while an event form is open: this adapter lives as long as the panel, on every page.
  const formOpen = computed(() => Object.values(store.forms).some((form) => form.generatorId === ID));
  const { data: deities } = useAllDeities(() => formOpen.value);
  const { data: pantheons } = useAllPantheons(() => formOpen.value);
  const { data: factions } = useAllFactions(() => formOpen.value);

  function quote(proposal: AskProposal): AskQuote {
    const total = textCredits(costOf("calendar_event_generation"));
    const form = fillerOf<CalendarEventDraft, EventFormContext>(ID, proposal)?.context() ?? null;
    const lines: AskQuoteLine[] = [{ label: "Fills", value: "The event's description", credits: null }];
    if (form) lines.push({ label: "Date", value: form.dateLabel, credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push({ label: "Description", value: "Written by AI", credits: total });
    // The box is optional: only its length can block, never its being empty.
    const tooLong: AskQuoteBlock | null = proposal.concept.trim().length > CONCEPT_MAX ? { reason: "missing", message: `Shorten the description to ${CONCEPT_MAX} characters.` } : null;
    let block = blockFor({ total }) ?? formClosedBlock(ID, FORM, proposal) ?? tooLong;
    if (!block && (!deities.value || !pantheons.value || !factions.value)) block = { reason: "missing", message: "Still reading your deities and factions." };
    return { lines, total, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    const current = quote(proposal);
    if (current.block) return failedRun("Description", current.block.message);
    if (isAnyAiGenerating.value) return failedRun("Description", "Another AI generation is already running. Try again when it finishes.");
    const form = fillerOf<CalendarEventDraft, EventFormContext>(ID, proposal)?.context();
    if (!form || !deities.value || !pantheons.value || !factions.value) return failedRun("Description", "The event could not be read.");
    const constraints = buildCalendarEventConstraints({ dateLabel: form.dateLabel, eventType: form.eventType, deities: deities.value, pantheons: pantheons.value, factions: factions.value });
    const result = await generate(proposal.concept.trim(), constraints, form.eventType);
    if (result === null) return failedRun("Description", error.value ?? "The description could not be written. Nothing was charged.");
    const credits = current.total === null ? 0 : current.total;
    return landInForm({ generatorId: ID, proposal, label: "Description", form: FORM, name: result.title, result, credits });
  }

  return { id: ID, quote, run };
}

export default useEventDescriptionAskAdapter;
