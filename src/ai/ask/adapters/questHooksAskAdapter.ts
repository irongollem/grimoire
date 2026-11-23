/**
 * Ask Grimoire (#1253): suggesting quest hooks, as a quote and a run that ends in the page's own review.
 *
 * Generating the five hooks is this adapter's whole job. Building one into a quest is the Quest Generator panel's
 * "Create Quest" on the DM's pick (`useCreateQuestFromHook`), never Ask's: "Review suggestions" opens that panel with
 * the hooks already in it (they live in `useQuestGeneration`'s module state), and the quest giver and place Ask
 * understood are handed over through `questGeneratorPrefill` so a pick is built with them.
 *
 * The request is the panel's: `buildQuestHooksPrompt` over the party's level, the giver and the place. The giver and
 * place are looked up in this campaign by id, so an id the model invented is simply not understood.
 */
import { computed, ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { conceptBlock, failedRun } from "@/ai/ask/adapters/askAdapterKit";
import { askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { countWord } from "@/ai/ask/adapters/suggestionCount";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { useQuestGeneration } from "@/ai/useQuestGeneration";
import { useCampaignStore } from "@/stores/campaign";
import { useQuestsUiStore } from "@/stores/ui/quests";
import { useQuestHooksQuote } from "@/composables/ai/quotes/questHooksQuote";
import { useActiveParty } from "@/composables/party/useActiveParty";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useAllLocations } from "@/composables/locations/useLocations";
import { buildQuestHooksPrompt } from "@/lib/quests/hooksPrompt";

export function useQuestHooksAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const questsUi = useQuestsUiStore();
  const quoteHooks = useQuestHooksQuote();
  const { blockFor } = useAskGate("quests", "quest");
  const { generate, error: generationError, concept: generationConcept, clearCompleted } = useQuestGeneration();

  // Read only once a proposal needs them: this adapter lives as long as the Ask panel, which is mounted on every
  // page, and a closed panel must cost no egress. The party sets the level; the lists only resolve the two ids.
  const partyWanted = ref(false);
  const listsWanted = ref(false);
  const { data: party } = useActiveParty(() => partyWanted.value);
  const { data: npcs } = useNpcs(() => listsWanted.value);
  const { data: locations } = useAllLocations(() => listsWanted.value);
  const loading = computed(
    () => (partyWanted.value && party.value === undefined)
      || (listsWanted.value && (npcs.value === undefined || locations.value === undefined)),
  );

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("quest_hooks", proposal.inputs);
    const giverId = askString(inputs, "quest_giver_id");
    const locationId = askString(inputs, "location_id");
    partyWanted.value = true;
    if (giverId !== null || locationId !== null) listsWanted.value = true;
    return {
      giver: giverId === null ? null : npcs.value?.find((n) => n.id === giverId) ?? null,
      location: locationId === null ? null : locations.value?.find((l) => l.id === locationId) ?? null,
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteHooks();

    const lines: AskQuoteLine[] = [];
    if (read.giver) lines.push({ label: "Quest giver", value: read.giver.name, credits: null });
    if (read.location) lines.push({ label: "Place", value: read.location.name, credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push({ label: "You get", value: "Five hooks to pick one from", credits: null });
    lines.push(...priced.lines);

    let block = blockFor({ total: priced.total, byok: priced.byok });
    block = block ?? conceptBlock(read.concept, "quest", { empty: "Say what kind of quest you want first.", limit: AI_PROMPT_LIMIT_SHORT });
    if (!block && loading.value) {
      block = { reason: "missing", message: "Still reading this campaign's party, people and places." };
    }
    return { lines, total: priced.total, byok: priced.byok, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Quest hooks", current.block.message);
    if (isAnyAiGenerating.value) return failedRun("Quest hooks", "Another generation is already in progress.");
    const read = understand(proposal);
    const spent = current.total === null ? 0 : current.total;

    const { prompt, concept } = buildQuestHooksPrompt({
      partyLevels: (party.value ?? []).map((m) => m.level),
      giver: read.giver ? { name: read.giver.name, occupation: read.giver.occupation, relationship: read.giver.relationship } : null,
      location: read.location ? { name: read.location.name } : null,
      // The DM's description is the theme: the page's Theme box, filled in for them.
      theme: read.concept,
    });
    generationConcept.value = concept;
    clearCompleted();

    let hooks;
    try {
      hooks = await generate(prompt);
    } catch (e) {
      return failedRun("Quest hooks", e instanceof Error ? e.message : "The quest hooks could not be written.");
    }
    if (hooks === null) return failedRun("Quest hooks", generationError.value ?? "The quest hooks could not be written.");

    const giverNpcId = read.giver?.id ?? "";
    const locationId = read.location?.id ?? "";
    return {
      record: null,
      route: "/quests",
      open: () => {
        questsUi.questGeneratorPrefill = { giverNpcId, locationId };
        questsUi.questGeneratorOpen = true;
      },
      parts: [{ label: `${countWord(hooks.length)} quest ${hooks.length === 1 ? "hook is" : "hooks are"} ready.`, ok: true, credits: spent }],
    };
  }

  return { id: "quest_hooks", quote, run };
}

export default useQuestHooksAskAdapter;
