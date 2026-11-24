/**
 * Ask Grimoire (#1253): the Dungeon Feature Generator, as a quote and a run.
 *
 * The price is `useDungeonFeatureQuote`'s (the one `DungeonFeatureGeneratorPanel` shows), the gates are the page's (AI off, a game system without stat blocks, the balance: features have no quota) and the run
 * is `useGenerateDungeonFeature`, the generate-and-save step the page calls. The kind is kept only when it is one the page's picker offers; the trigger is not asked through Ask.
 *
 * A failed picture never costs the feature: the row is saved first and the picture is its own part. There is no
 * one-picture retry for a feature yet (`useMissingPortrait` has no kind for it), so a failed picture says to add one
 * from the feature's own page.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { conceptBlock, failedRun, picturePart, spent } from "@/ai/ask/adapters/askAdapterKit";
import { askFlag, askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { useDungeonFeatureQuote } from "@/composables/ai/quotes/dungeonFeatureQuote";
import { useGenerateDungeonFeature } from "@/composables/dungeon-features/useGenerateDungeonFeature";
import { isQuotaExceeded } from "@/lib/quotaError";
import { DUNGEON_FEATURE_TYPES } from "@/types/dungeonFeature.types";

/** The page's picker offers a fixed list: a value is kept only when it is on it, spelled the way the page spells it. */
function knownFeatureType(said: string | null): string | null {
  if (said === null) return null;
  const found = DUNGEON_FEATURE_TYPES.find((t) => t.toLowerCase() === said.toLowerCase());
  return found === undefined ? null : found;
}

export function useDungeonFeatureAskAdapter(): AskAdapter {
  const quoteDungeonFeature = useDungeonFeatureQuote();
  const { blockFor } = useAskGate(null, "feature");
  const { generateAndCreateFeature } = useGenerateDungeonFeature();

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("dungeon_feature", proposal.inputs);
    const type = knownFeatureType(askString(inputs, "feature_type"));
    return {
      featureType: type,
      image: askFlag(inputs, "image"),
      concept: proposal.concept.trim(),
    };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = quoteDungeonFeature({ image: read.image });

    const lines: AskQuoteLine[] = [];
    if (read.featureType) lines.push({ label: "Kind", value: read.featureType, credits: null });
    lines.push(...priced.lines);
    if (!read.image) lines.push({ label: "Picture", value: "None", credits: null });

    let block = blockFor({ total: priced.total, fiveE: true });
    block = block ?? conceptBlock(read.concept, "feature");
    return { lines, total: priced.total, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    // The state may have moved since the DM read the quote: the same gates, again, before anything is spent.
    const current = quote(proposal);
    if (current.block) return failedRun("Feature text", current.block.message);
    const read = understand(proposal);

    let outcome;
    try {
      outcome = await generateAndCreateFeature(read.concept, {
        feature_type: read.featureType ?? undefined,
        // Explicit either way: left out, the generator paints a picture.
        generateImage: read.image,
      });
    } catch (e) {
      const message = isQuotaExceeded(e)
        ? "You have reached your limit of features on this plan."
        : e instanceof Error ? e.message : "The feature could not be saved.";
      return failedRun("Feature text", message);
    }
    if (!outcome.id || outcome.name === null) return failedRun("Feature text", outcome.error ?? "Dungeon Feature generation failed.");

    const parts: AskRunResult["parts"] = [
      { label: "Feature text", ok: true, credits: spent(current.lines.find((l) => l.label === "Feature text")) },
    ];
    if (read.image) {
      const credits = spent(current.lines.find((l) => l.label === "Picture"));
      parts.push(picturePart({ saved: outcome.picture === "saved", credits, noun: "feature" }));
    }
    return { record: { type: "other", id: outcome.id, name: outcome.name }, route: `/dungeon-features/${outcome.id}`, parts, picture: outcome.picture === "saved" && outcome.pictureUrl !== null ? outcome.pictureUrl : undefined };
  }

  return { id: "dungeon_feature", quote, run };
}

export default useDungeonFeatureAskAdapter;
