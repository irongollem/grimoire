/**
 * Ask Grimoire (#1253, #1270): suggesting quest hooks, as a quote and a preview.
 *
 * Generating the five hooks is the gilt button's job (`useQuestGeneration`, the request is `buildQuestHooksPrompt`
 * over the party's level, the giver and the place, with the description as the theme). The hooks come back in the pane
 * as the preview, each with its story beats and route, and each hook has its own "Create quest" on its row
 * (`useCreateQuestFromHook`: the quest, its spine, the objectives and the resolved people and places), as the old panel
 * had one on each hook. A hook is built once (a second press finds it built); the preview stays open for the others.
 * The card's own button, "Done", ends it with a result naming the quests built (none built: nothing to keep, so it
 * says to press a hook's Create quest or Discard).
 *
 * The giver and place are looked up in this campaign by id, so an id the model invented is simply not understood. The
 * theme is optional (the panel's was): only its length is held.
 */
import { computed, ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskPreviewAdapter, AskPreviewOutcome, AskPreviewRow, AskPreviewShown, AskQuote, AskQuoteLine, AskResultLink, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { failedRun, saveFailure } from "@/ai/ask/adapters/askAdapterKit";
import { questLinkHref } from "@/lib/quests/navigation";
import { askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import type { QuestHookResult } from "@/ai/types";
import { useQuestGeneration } from "@/ai/useQuestGeneration";
import { useCampaignStore } from "@/stores/campaign";
import { useQuestHooksQuote } from "@/composables/ai/quotes/questHooksQuote";
import { useCreateQuestFromHook } from "@/composables/quests/useCreateQuestFromHook";
import { useActiveParty } from "@/composables/party/useActiveParty";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useAllFactions } from "@/composables/factions/useFactions";
import { buildQuestHooksPrompt } from "@/lib/quests/hooksPrompt";
import { describeSpineRoutes, planSpineBeats } from "@/lib/quests/spine";

/** What the card shows of the hooks: one block each (player log, objectives, story beats, route) with its own Create quest. */
function shownHooks(hooks: readonly QuestHookResult[], create: (index: number) => AskPreviewRow["action"]): AskPreviewShown {
  return {
    title: `${hooks.length} quest ${hooks.length === 1 ? "hook" : "hooks"}`,
    sections: hooks.map((hook, index) => {
      // The same plan the write path uses, so the card can never show a beat or route Create would then drop (#822).
      const beats = planSpineBeats(hook.beats);
      const route = describeSpineRoutes(beats, hook.routes);
      return {
        heading: hook.title,
        hint: hook.summary,
        rows: [
          { label: "Quest", detail: "", action: create(index) },
          ...hook.objectives.map((o) => ({ label: "Objective", detail: o.description })),
          ...beats.map((b, i) => ({ label: `${i + 1}. ${b.title}`, detail: b.kind })),
          ...(route.length > 0 ? [{ label: "Route", detail: route.join(", ") }] : []),
        ],
      };
    }),
  };
}

export function useQuestHooksAskAdapter(): AskPreviewAdapter {
  const campaign = useCampaignStore();
  const quoteHooks = useQuestHooksQuote();
  const { blockFor } = useAskGate("quests", "quest");
  const { generate, error: generationError, concept: generationConcept, completedEntityId, provenance, clearCompleted } = useQuestGeneration();
  const { createFromHook } = useCreateQuestFromHook();

  // Read only once a proposal needs them: this adapter lives as long as the Ask panel, which is mounted on every
  // page, and a closed panel must cost no egress. The party sets the level; the lists resolve the two ids, and (once
  // hooks are shown) the people and places a hook mentions.
  const partyWanted = ref(false);
  const listsWanted = ref(false);
  const { data: party } = useActiveParty(() => partyWanted.value);
  const { data: npcs } = useNpcs(() => listsWanted.value);
  const { data: locations } = useAllLocations(() => listsWanted.value);
  const { data: factions } = useAllFactions(() => listsWanted.value);
  const loading = computed(
    () => (partyWanted.value && party.value === undefined)
      || (listsWanted.value && (npcs.value === undefined || locations.value === undefined || factions.value === undefined)),
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

    let block = blockFor({ total: priced.total });
    // The theme is optional, as the panel's was: only an overlong one stops the quote.
    if (!block && read.concept.length > AI_PROMPT_LIMIT_SHORT) {
      block = { reason: "missing", message: `Shorten the theme to ${AI_PROMPT_LIMIT_SHORT} characters.` };
    }
    if (!block && loading.value) {
      block = { reason: "missing", message: "Still reading this campaign's party, people and places." };
    }
    return { lines, total: priced.total, block };
  }

  /** Generates and holds the hooks for the DM to look at: the gilt button charges here, and `create` builds one for nothing more. */
  async function preview(proposal: AskProposal): Promise<AskPreviewOutcome> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return { ok: false, result: failedRun("Quest hooks", current.block.message) };
    if (isAnyAiGenerating.value) return { ok: false, result: failedRun("Quest hooks", "Another generation is already in progress.") };
    const read = understand(proposal);
    // What a built quest links to (the people and places a hook names) is read while the hooks are being written.
    listsWanted.value = true;

    const { prompt, concept } = buildQuestHooksPrompt({
      partyLevels: (party.value ?? []).map((m) => m.level),
      giver: read.giver ? { name: read.giver.name, occupation: read.giver.occupation, relationship: read.giver.relationship } : null,
      location: read.location ? { name: read.location.name } : null,
      theme: read.concept,
    });
    generationConcept.value = concept;
    clearCompleted();

    let written: QuestHookResult[] | null;
    try {
      written = await generate(prompt);
    } catch (e) {
      return { ok: false, result: failedRun("Quest hooks", e instanceof Error ? e.message : "The quest hooks could not be written.") };
    }
    if (written === null) return { ok: false, result: failedRun("Quest hooks", generationError.value ?? "The quest hooks could not be written.") };
    const hooks: QuestHookResult[] = written;
    const aiProvenance = provenance.value;

    const parts: AskRunPart[] = [{ label: "Quest hooks", ok: true, credits: current.total === null ? 0 : current.total }];
    /** The quests built so far, by the hook's place in the list: a hook is built once. */
    const built = new Map<number, { questId: string; name: string }>();
    const building = new Set<number>();

    async function createHook(index: number): Promise<AskRunPart & { links?: AskResultLink[] }> {
      const hook = hooks[index];
      if (hook === undefined) return { label: "Quest", ok: false, credits: 0, error: "That hook is no longer here." };
      const already = built.get(index);
      if (already) return { label: `Quest "${already.name}"`, ok: true, credits: 0, links: [{ label: "View quest", route: questLinkHref(already.questId) }] };
      if (building.has(index)) return { label: `Quest "${hook.title}"`, ok: false, credits: 0, error: "Still being built." };
      const people = npcs.value;
      const places = locations.value;
      const factionList = factions.value;
      if (people === undefined || places === undefined || factionList === undefined) {
        return { label: "Quest", ok: false, credits: 0, error: "Still reading this campaign's people and places. Try again in a moment." };
      }
      building.add(index);
      let result;
      try {
        result = await createFromHook({
          hook,
          giverNpcId: read.giver?.id ?? "",
          locationId: read.location?.id ?? "",
          entityPools: {
            npcs: people.map((n) => ({ id: n.id, name: n.name })),
            locations: places.map((l) => ({ id: l.id, name: l.name })),
            factions: factionList.map((f) => ({ id: f.id, name: f.name })),
          },
          aiProvenance,
        });
      } catch (e) {
        return { label: `Quest "${hook.title}"`, ok: false, credits: 0, error: saveFailure(e, "quests", "The quest could not be saved.") };
      } finally {
        building.delete(index);
      }
      completedEntityId.value = result.questId;
      built.set(index, { questId: result.questId, name: hook.title });
      return {
        label: `Quest "${hook.title}"`,
        ok: true,
        credits: 0,
        // #822: no beat is manufactured when the model returned no usable spine, but the DM asked for a quest and got
        // less than one, so the row says so instead of leaving them to find out in the story flow.
        ...(result.beatsCreated === 0 ? { error: `It has no story beats yet. The AI didn't return one. Its objectives are ready; write the beats yourself in the story flow.` } : {}),
        links: [{ label: "View quest", route: questLinkHref(result.questId) }],
      };
    }

    const rowAction = (index: number): AskPreviewRow["action"] => ({ label: "Create quest", doneLabel: "Created", run: () => createHook(index) });

    /** Done: ends the preview with what was built. The hooks not built are not kept; the DM chose which to make. */
    async function create(): Promise<AskRunResult> {
      const quests = [...built.values()];
      const [first] = quests;
      if (first === undefined) return failedRun("Quest", "Press Create quest on a hook first, or Discard.");
      return {
        record: { type: "quest", id: first.questId, name: first.name },
        route: quests.length === 1 ? questLinkHref(first.questId) : null,
        ...(quests.length > 1 ? { links: quests.map((q) => ({ label: `View ${q.name}`, route: questLinkHref(q.questId) })) } : {}),
        parts: [...parts, ...quests.map((q) => ({ label: `Created the quest "${q.name}"`, ok: true, credits: 0 }))],
      };
    }

    return { ok: true, preview: { shown: shownHooks(hooks, rowAction), parts, create } };
  }

  return { id: "quest_hooks", quote, preview };
}

export default useQuestHooksAskAdapter;
