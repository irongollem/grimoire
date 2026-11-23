/**
 * Ask Grimoire (#1253): the Location Generator, as a quote and a run.
 *
 * A seam over the page's own workflow: the price is `useLocationQuote`'s (the one `LocationGeneratorPanel` shows), the
 * gates are the page's (`useAskGate`, with the plan's location quota), and the run is `useGenerateLocation`. The map
 * sketch is the page's own extra switch and the contract does not offer it, so it is always off here.
 *
 * `parent_id` must name a place of this campaign: the id is looked up in the campaign's Atlas and ignored otherwise,
 * so the model cannot file a place under a row of another campaign. The Atlas is read only once a proposal names a
 * parent, because this adapter lives as long as the panel. A kind of place is understood only when it is one of the
 * app's own (by key or by label).
 */
import { computed, ref } from "vue";
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { askFlag, askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { conceptBlock, failedRun, matchKey, picturePart, spent } from "@/ai/ask/adapters/askAdapterKit";
import { useCampaignStore } from "@/stores/campaign";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useLocationQuote } from "@/composables/ai/quotes/locationQuote";
import { useGenerateLocation } from "@/composables/locations/useGenerateLocation";
import { placeRoute } from "@/lib/locations/placeRoute";
import { isQuotaExceeded } from "@/lib/quotaError";
import { LOCATION_TYPE_LABELS, type LocationType } from "@/types/location.types";

const LOCATION_TYPES = Object.keys(LOCATION_TYPE_LABELS) as LocationType[];

/** A kind of place as the DM may say it: the key ("city"), or the label ("City"), case and spacing aside. */
function locationType(value: string | null): LocationType | null {
  const byKey = matchKey(value, LOCATION_TYPES);
  if (byKey) return byKey;
  if (value === null) return null;
  return LOCATION_TYPES.find((key) => LOCATION_TYPE_LABELS[key].toLowerCase() === value.toLowerCase()) ?? null;
}

export function useLocationAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteLocation = useLocationQuote();
  const { blockFor } = useAskGate("locations", "place");
  const { generateAndCreateLocation } = useGenerateLocation();

  const lookupsWanted = ref(false);
  const { data: locations } = useAllLocations(() => lookupsWanted.value);
  const lookupsLoading = computed(() => lookupsWanted.value && locations.value === undefined);

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("location", proposal.inputs);
    const parentId = askString(inputs, "parent_id");
    if (parentId !== null) lookupsWanted.value = true;
    const parent = parentId === null ? null : locations.value?.find((l) => l.id === parentId) ?? null;
    return {
      locationType: locationType(askString(inputs, "location_type")),
      parent: parent ? { id: parent.id, name: parent.name } : null,
      image: askFlag(inputs, "image"),
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteLocation({ image: read.image, map: false });

    const lines: AskQuoteLine[] = [];
    if (read.locationType) lines.push({ label: "Kind", value: LOCATION_TYPE_LABELS[read.locationType], credits: null });
    if (read.parent) lines.push({ label: "Inside", value: read.parent.name, credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);
    if (!read.image) lines.push({ label: "Picture", value: "None", credits: null });

    let block = blockFor({ total: priced.total, byok: priced.byok }) ?? conceptBlock(read.concept, "place");
    if (!block && lookupsLoading.value) {
      block = { reason: "missing", message: "Still reading this campaign's places." };
    }
    return { lines, total: priced.total, byok: priced.byok, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Place", current.block.message);
    const read = understand(proposal);

    let outcome;
    try {
      outcome = await generateAndCreateLocation(read.concept, {
        locationType: read.locationType ?? undefined,
        parent: read.parent,
        // Explicit either way: left out, the generator paints a scene. The map sketch is not Ask's to spend on.
        generateImage: read.image,
        generateMap: false,
      });
    } catch (e) {
      const message = isQuotaExceeded(e)
        ? "You have reached your limit of places on this plan."
        : e instanceof Error ? e.message : "The place could not be saved.";
      return failedRun("Place", message);
    }
    if (!outcome.id || outcome.name === null) return failedRun("Place", outcome.error ?? "Place generation failed.");

    const id = outcome.id;
    const parts: AskRunPart[] = [{ label: "Place", ok: true, credits: spent(current.lines.find((l) => l.label === "Place")) }];
    if (read.image) {
      parts.push(picturePart({
        label: "Picture",
        saved: outcome.picture === "saved",
        credits: spent(current.lines.find((l) => l.label === "Picture")),
        noun: "place",
      }));
    }
    return { record: { type: "location", id, name: outcome.name }, route: placeRoute(id), parts };
  }

  return { id: "location", quote, run };
}

export default useLocationAskAdapter;
