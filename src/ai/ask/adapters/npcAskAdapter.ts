/**
 * Ask Grimoire (#1253): the NPC generator, as a quote and a run.
 *
 * A seam over the page's own workflow: the price is `useNpcQuote`'s (the one `NpcGeneratorPanel` shows), the
 * gates are the page's (`useAskGate`), and the run is `useGenerateNpc`, the generate-and-create step the page calls.
 * What it adds is reading the proposal: `proposal.inputs` through the schema (`readAskInputs`), so only what the
 * contract lists reaches the generator.
 *
 * The likeness notice for an alter ego is not a block here: the workflow itself asks for it (`useNpcGeneration`
 * calls `ensureLikenessAck`), and the notice dialog is mounted app-wide, so it opens over the Ask panel exactly as it
 * does over the page. Declining it makes nothing and costs nothing, and the result says so.
 *
 * A failed picture never costs the NPC: the row and its text are saved first, the portrait is its own part, and it
 * carries `retry`, which paints the saved NPC once with the page's own paint flow.
 */
import { computed, ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { conceptBlock, failedRun, picturePart, spent } from "@/ai/ask/adapters/askAdapterKit";
import { askFlag, askInteger, askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { useMissingPortrait } from "@/ai/useMissingPortrait";
import { useCampaignStore } from "@/stores/campaign";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useAllFactions } from "@/composables/factions/useFactions";
import { useNpcQuote } from "@/composables/ai/quotes/npcQuote";
import { buildNpcAiContext, useGenerateNpc, type NpcGenerateForm } from "@/composables/npcs/useGenerateNpc";
import { isQuotaExceeded } from "@/lib/quotaError";
import { DEFAULT_ASSOCIATE } from "@/lib/npcGenerator/associate";

/** The form's way to say "not given" is an empty string. */
function blankIfUnsaid(value: string | null): string {
  return value === null ? "" : value;
}

export function useNpcAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteFor = useNpcQuote();
  const { blockFor } = useAskGate("npcs", "NPC");
  const { generateAndCreateNpc } = useGenerateNpc();
  const missing = useMissingPortrait("npc");

  // The places and factions are read only once a proposal names one: this adapter lives as long as the panel, which
  // is mounted on every page, and a closed panel must cost no egress.
  const lookupsWanted = ref(false);
  const { data: locations } = useAllLocations(() => lookupsWanted.value);
  const { data: factions } = useAllFactions(() => lookupsWanted.value);
  const lookupsLoading = computed(() => lookupsWanted.value && (locations.value === undefined || factions.value === undefined));

  /** What Ask understood of the proposal, with ids only when they name a row this campaign has. */
  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("npc", proposal.inputs);
    const locationId = askString(inputs, "location_id");
    const factionId = askString(inputs, "faction_id");
    if (locationId !== null || factionId !== null) lookupsWanted.value = true;
    const location = locationId === null ? null : locations.value?.find((l) => l.id === locationId) ?? null;
    const faction = factionId === null ? null : factions.value?.find((f) => f.id === factionId) ?? null;
    return {
      name: askString(inputs, "name"),
      race: askString(inputs, "race"),
      age: askInteger(inputs, "age"),
      alignment: askString(inputs, "alignment"),
      role: askString(inputs, "role"),
      location,
      faction,
      portrait: askFlag(inputs, "portrait"),
      alterEgo: askFlag(inputs, "alter_ego"),
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteFor({ portrait: read.portrait, alterEgo: read.alterEgo });

    const who = [read.race, read.age === null ? null : `about ${read.age}`].filter((part) => part !== null).join(", ");
    const lines: AskQuoteLine[] = [];
    if (read.name) lines.push({ label: "Name", value: read.name, credits: null });
    lines.push({ label: "Who", value: who || "As the description says", credits: null });
    if (read.role) lines.push({ label: "Role", value: read.role, credits: null });
    if (read.location) lines.push({ label: "Lives in", value: read.location.name, credits: null });
    if (read.faction) lines.push({ label: "Faction", value: read.faction.name, credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);
    if (!read.portrait) lines.push({ label: "Portrait", value: "None", credits: null });

    let block = blockFor({ total: priced.total, byok: priced.byok });
    block = block ?? conceptBlock(read.concept, "NPC");
    if (!block && lookupsLoading.value) {
      block = { reason: "missing", message: "Still reading this campaign's places and factions." };
    }
    return { lines, total: priced.total, byok: priced.byok, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("NPC text", current.block.message);
    const read = understand(proposal);
    const campaignId = campaign.activeCampaignId;
    if (!campaignId) return failedRun("NPC text", "No active campaign selected.");

    const form: NpcGenerateForm = {
      name: blankIfUnsaid(read.name),
      race: blankIfUnsaid(read.race),
      alignment: blankIfUnsaid(read.alignment),
      relationship: "unknown",
      templateId: "auto",
      location_id: read.location?.id ?? null,
      faction_id: read.faction?.id ?? null,
      faction_role: "Member",
      related_npc_id: null,
      related_npc_tie: DEFAULT_ASSOCIATE,
      related_npc_kin: null,
      related_pc_id: null,
      second_parent: null,
    };
    // The schema's age and role have no field on the page's form; the model reads them as constraint lines.
    const extra = [
      read.age === null ? null : `Age: about ${read.age}`,
      read.role ? `Occupation: ${read.role}` : null,
    ].filter((line) => line !== null);
    const context = [
      ...extra,
      buildNpcAiContext(form, form.location_id, [], {
        locations: read.location ? [read.location] : [],
        factions: read.faction ? [read.faction] : [],
        npcs: [],
        party: [],
        todayYear: campaign.todayYear,
      }),
    ].filter((line) => line !== "").join("\n");

    const textCredits = spent(current.lines.find((l) => l.label === "NPC text"));
    const portraitCredits = spent(current.lines.find((l) => l.label === "Portrait"));

    let outcome;
    try {
      outcome = await generateAndCreateNpc({
        concept: read.concept,
        prompt: read.concept,
        context,
        generateAlterEgo: read.alterEgo,
        generateImage: read.portrait,
        form,
        locationId: form.location_id,
        inventoryItems: [],
        associate: null,
      });
    } catch (e) {
      // A quota race on the create, or a save that failed: the generated text is lost, so say so plainly.
      const message = isQuotaExceeded(e)
        ? "You have reached your limit of NPCs on this plan."
        : e instanceof Error ? e.message : "The NPC could not be saved.";
      return failedRun("NPC text", message);
    }
    if (!outcome.id || outcome.name === null) {
      // `error` is null when the DM declined the likeness notice.
      return failedRun("NPC text", outcome.error ?? "The likeness notice was not accepted, so nothing was made.");
    }

    const id = outcome.id;
    const name = outcome.name;
    const parts: AskRunPart[] = [{ label: "NPC text", ok: true, credits: textCredits }];
    if (read.portrait) parts.push(portraitPart(outcome.portrait, outcome.disguisePortrait, read.alterEgo, portraitCredits, id, `${name}. ${read.concept}`));
    if (outcome.linkErrors.length) {
      parts.push({ label: "Connections", ok: false, credits: 0, error: `Some connections could not be added: ${outcome.linkErrors.join("; ")}` });
    }
    if (outcome.inventoryError) parts.push({ label: "Starter items", ok: false, credits: 0, error: outcome.inventoryError });
    return { record: { type: "npc", id, name }, route: `/npcs/${id}`, parts };
  }

  function portraitPart(
    portrait: "none" | "saved" | "failed",
    disguise: "none" | "saved" | "failed",
    alterEgo: boolean,
    credits: number,
    npcId: string,
    paintContext: string,
  ): AskRunPart {
    if (portrait === "saved" && (!alterEgo || disguise === "saved")) return { label: "Portrait", ok: true, credits };
    if (portrait === "saved") {
      // The true portrait is saved; only the alter ego's picture is missing, and the paint flow repaints the true one.
      return { label: "Portrait", ok: false, credits: 0, error: "The alter ego's picture could not be painted. The NPC is saved with their portrait." };
    }
    return picturePart({
      label: "Portrait",
      saved: false,
      // A repaint whose price is unknown reports nothing spent here; the quote's figure belongs to the first try.
      credits: 0,
      noun: "NPC",
      retry: { credits: missing.cost.value, paint: () => missing.paint(npcId, paintContext), error: () => missing.error.value },
    });
  }

  return { id: "npc", quote, run };
}

export default useNpcAskAdapter;
