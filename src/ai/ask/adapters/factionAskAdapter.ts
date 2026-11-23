/**
 * Ask Grimoire (#1253): the Faction Generator, as a quote and a run.
 *
 * A seam over the page's own workflow: the price is `useFactionQuote`'s (the one `FactionGeneratorPanel` shows), the
 * gates are the page's (`useAskGate`, with the plan's faction quota), and the run is `useGenerateFaction`.
 *
 * The page has pickers of existing records, and the contract gives the same as ids: `leader_npc_id` seats an existing
 * NPC as the faction's "Leader" and `headquarters_id` ties it "based in" an existing place. Each id is looked up in
 * this campaign's own NPCs and Atlas and ignored when it is not there, so the model cannot link a row of another
 * campaign. `leader_name` and `headquarters_name` are for a person or place that does not exist yet: they only shape
 * the description and never link (a name is not an identity: two NPCs share one). The campaign's NPCs and places are
 * read only once a proposal names one, because this adapter lives as long as the panel.
 *
 * The faction is saved before its ties and its emblem are judged. A leader or headquarters that fails to link is its
 * own failed part and never undoes the faction; a failed emblem is a failed part with no retry, because no paint flow
 * exists for a faction's emblem.
 */
import { computed, ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { askFlag, askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { conceptBlock, failedRun, picturePart, spent } from "@/ai/ask/adapters/askAdapterKit";
import { useCampaignStore } from "@/stores/campaign";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useFactionQuote } from "@/composables/ai/quotes/factionQuote";
import { useGenerateFaction } from "@/composables/factions/useGenerateFaction";
import { isQuotaExceeded } from "@/lib/quotaError";
import { FACTION_ALIGNMENTS, FACTION_TYPES } from "@/types/faction.types";

/** A word of the proposal matched, case aside, against the page's own list: the page's spelling, or null. */
function canonical(value: string | null, list: readonly string[]): string | null {
  if (value === null) return null;
  return list.find((entry) => entry.toLowerCase() === value.toLowerCase()) ?? null;
}

export function useFactionAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteFaction = useFactionQuote();
  const { blockFor } = useAskGate("factions", "faction");
  const { generateAndCreateFaction } = useGenerateFaction();

  const lookupsWanted = ref(false);
  const { data: npcs } = useNpcs(() => lookupsWanted.value);
  const { data: locations } = useAllLocations(() => lookupsWanted.value);
  const lookupsLoading = computed(() => lookupsWanted.value && (npcs.value === undefined || locations.value === undefined));

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("faction", proposal.inputs);
    const leaderId = askString(inputs, "leader_npc_id");
    const headquartersId = askString(inputs, "headquarters_id");
    if (leaderId !== null || headquartersId !== null) lookupsWanted.value = true;
    return {
      factionType: canonical(askString(inputs, "faction_type"), FACTION_TYPES),
      alignment: canonical(askString(inputs, "alignment"), FACTION_ALIGNMENTS),
      leaderName: askString(inputs, "leader_name"),
      leader: leaderId === null ? null : npcs.value?.find((n) => n.id === leaderId) ?? null,
      headquartersName: askString(inputs, "headquarters_name"),
      headquarters: headquartersId === null ? null : locations.value?.find((l) => l.id === headquartersId) ?? null,
      image: askFlag(inputs, "image"),
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteFaction({ image: read.image });

    const lines: AskQuoteLine[] = [];
    if (read.factionType) lines.push({ label: "Type", value: read.factionType, credits: null });
    if (read.alignment) lines.push({ label: "Alignment", value: read.alignment, credits: null });
    if (read.leader) lines.push({ label: "Leader", value: `${read.leader.name}, from your NPCs`, credits: null });
    else if (read.leaderName) lines.push({ label: "Leader", value: `${read.leaderName}, named only`, credits: null });
    if (read.headquarters) lines.push({ label: "Headquarters", value: `${read.headquarters.name}, from your Atlas`, credits: null });
    else if (read.headquartersName) lines.push({ label: "Headquarters", value: `${read.headquartersName}, named only`, credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);
    if (!read.image) lines.push({ label: "Emblem", value: "None", credits: null });

    let block = blockFor({ total: priced.total, byok: priced.byok }) ?? conceptBlock(read.concept, "faction");
    if (!block && lookupsLoading.value) {
      block = { reason: "missing", message: "Still reading this campaign's NPCs and places." };
    }
    return { lines, total: priced.total, byok: priced.byok, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Faction", current.block.message);
    const read = understand(proposal);

    let outcome;
    try {
      outcome = await generateAndCreateFaction(read.concept, {
        faction_type: read.factionType ?? undefined,
        alignment: read.alignment ?? undefined,
        // The page words a picked leader as "Name (occupation)"; a name only is as the DM said it.
        leader_name: read.leader ? (read.leader.occupation ? `${read.leader.name} (${read.leader.occupation})` : read.leader.name) : read.leaderName ?? undefined,
        headquarters_name: read.headquarters ? read.headquarters.name : read.headquartersName ?? undefined,
        leaderNpcId: read.leader?.id ?? null,
        headquartersLocationId: read.headquarters?.id ?? null,
        // Explicit either way: left out, the generator paints an emblem.
        generateImage: read.image,
      });
    } catch (e) {
      const message = isQuotaExceeded(e)
        ? "You have reached your limit of factions on this plan."
        : e instanceof Error ? e.message : "The faction could not be saved.";
      return failedRun("Faction", message);
    }
    if (!outcome.id || outcome.name === null) return failedRun("Faction", outcome.error ?? "Faction generation failed.");

    const id = outcome.id;
    const parts: AskRunPart[] = [{ label: "Faction", ok: true, credits: spent(current.lines.find((l) => l.label === "Faction")) }];
    if (read.image) {
      parts.push(picturePart({
        label: "Emblem",
        saved: outcome.picture === "saved",
        credits: spent(current.lines.find((l) => l.label === "Emblem")),
        noun: "faction",
      }));
    }
    // One part per tie that was attempted, so a failed leader never hides a headquarters that worked.
    if (outcome.leader !== "none") {
      parts.push(outcome.leader === "saved"
        ? { label: "Leader", ok: true, credits: 0 }
        : { label: "Leader", ok: false, credits: 0, error: outcome.linkErrors.find((m) => m.startsWith("The leader")) ?? "The leader could not be added." });
    }
    if (outcome.headquarters !== "none") {
      parts.push(outcome.headquarters === "saved"
        ? { label: "Headquarters", ok: true, credits: 0 }
        : { label: "Headquarters", ok: false, credits: 0, error: outcome.linkErrors.find((m) => m.startsWith("The headquarters")) ?? "The headquarters could not be set." });
    }
    return { record: { type: "faction", id, name: outcome.name }, route: `/factions/${id}`, parts };
  }

  return { id: "faction", quote, run };
}

export default useFactionAskAdapter;
