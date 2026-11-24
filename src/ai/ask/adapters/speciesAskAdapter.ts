/**
 * Ask Grimoire (#1253): the Species Generator, as a quote and a run.
 *
 * The price is `useSpeciesQuote`'s (the one `SpeciesGeneratorPanel` shows), the gates are the page's (`useAskGate`,
 * which also refuses a campaign whose game system has no 5e rules), and the run is `useGenerateSpecies`. The size is
 * matched against the page's own picker; a word it does not offer is not understood. A failed picture leaves the
 * species saved; the species kind is not one `useMissingPortrait` can paint, so there is no retry from Ask.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunPart, AskRunResult } from "@/lib/ask/askAdapter";
import { askFlag, askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { conceptBlock, failedRun, matchOption, picturePart, saveFailure, spent } from "@/ai/ask/adapters/askAdapterKit";
import { useCampaignStore } from "@/stores/campaign";
import { useSpeciesQuote } from "@/composables/ai/quotes/speciesQuote";
import { useGenerateSpecies } from "@/composables/rules/useGenerateSpecies";
import { SPECIES_SIZES } from "@/lib/codex/speciesAi";

const SIZES = SPECIES_SIZES.map((s) => ({ id: s, label: s }));

export function useSpeciesAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const quoteSpecies = useSpeciesQuote();
  const { blockFor } = useAskGate(null, "species");
  const { generateAndCreateSpecies } = useGenerateSpecies();

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("species", proposal.inputs);
    return {
      size: matchOption(askString(inputs, "size"), SIZES),
      image: askFlag(inputs, "image"),
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteSpecies({ image: read.image });

    const lines: AskQuoteLine[] = [];
    if (read.size) lines.push({ label: "Size", value: read.size, credits: null });
    lines.push({ label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null });
    lines.push(...priced.lines);
    if (!read.image) lines.push({ label: "Picture", value: "None", credits: null });

    const block = blockFor({ total: priced.total, fiveE: true }) ?? conceptBlock(read.concept, "species");
    return { lines, total: priced.total, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Species text", current.block.message);
    const read = understand(proposal);

    let outcome;
    try {
      outcome = await generateAndCreateSpecies(read.concept, {
        size: read.size ?? undefined,
        // Explicit either way: left out, the generator paints a picture.
        generateImage: read.image,
      });
    } catch (e) {
      return failedRun("Species text", saveFailure(e, "species", "The species could not be saved."));
    }
    if (!outcome.id || outcome.name === null) return failedRun("Species text", outcome.error ?? "Species generation failed.");

    const parts: AskRunPart[] = [{ label: "Species text", ok: true, credits: spent(current.lines.find((l) => l.label === "Species text")) }];
    if (read.image) {
      parts.push(outcome.picture === "saved"
        ? { label: "Picture", ok: true, credits: spent(current.lines.find((l) => l.label === "Picture")) }
        : picturePart({ saved: false, credits: 0, noun: "species" }));
    }
    return { record: { type: "other", id: outcome.id, name: outcome.name }, route: `/species/${outcome.id}`, parts, picture: outcome.picture === "saved" && outcome.pictureUrl !== null ? outcome.pictureUrl : undefined };
  }

  return { id: "species", quote, run };
}

export default useSpeciesAskAdapter;
