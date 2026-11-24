/**
 * Ask Grimoire (#1270): a picture in a Scriptorium book painted from a description, as a quote and a run.
 *
 * The book panel's "Describe it" opens this card for the picture that was selected; the model is never offered it
 * (there is no record to name). The shapes are the book's (`describeShapes`: the full page's proportions and five
 * more), each painted at the nearest of three oblongs, which is what it costs. The run is the old dialog's: the
 * likeness notice, a queued render, then the panel marks the picture as painting and waits for the job
 * (`useDescribedPictures`), so the writer keeps writing meanwhile.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { conceptBlock, failedRun, matchOption, spent } from "@/ai/ask/adapters/askAdapterKit";
import { askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { useAskSceneRender } from "@/ai/ask/askSceneRender";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";
import { useCampaignStore } from "@/stores/campaign";
import { useSceneIllustrationQuote } from "@/composables/ai/quotes/sceneIllustrationQuote";
import { currentDescribeSurface } from "@/scriptorium/composables/useDescribeSurface";

export function usePictureDescriptionAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const priceOf = useSceneIllustrationQuote();
  const { blockFor } = useAskGate(null, "picture");
  const render = useAskSceneRender();

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("picture_description", proposal.inputs);
    const shapes = currentDescribeSurface.value?.shapes() ?? [];
    const shape = shapes.find((s) => s.id === matchOption(askString(inputs, "shape"), shapes)) ?? shapes.find((s) => s.id === "square") ?? shapes[0] ?? null;
    const concept = proposal.concept.trim();
    return { shape, concept, scene: render.read(concept) };
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const surface = currentDescribeSurface.value;
    // With no picture chosen there is no shape to price: the quote waits for one, as it waits for a provider.
    const priced = read.shape === null ? { lines: [], total: null } : priceOf(read.shape.aiSize);
    const lines: AskQuoteLine[] = [
      ...(read.shape ? [{ label: "Shape", value: read.shape.label, credits: null }] : []),
      ...(read.scene.line ? [read.scene.line] : []),
      { label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null },
      ...priced.lines,
    ];
    let block = blockFor({ total: priced.total });
    if (!block && (surface === null || !surface.hasTarget())) {
      block = { reason: "missing", message: "Select a picture in the book, then press Describe it." };
    } else if (!block && surface?.campaignId() !== campaign.activeCampaignId) {
      block = { reason: "missing", message: "This book belongs to another campaign, and the picture is painted in the active one." };
    }
    block = block ?? conceptBlock(read.concept, "picture", { empty: "Describe the scene first.", limit: AI_PROMPT_LIMIT_SHORT, shorten: "scene" });
    if (!block && read.scene.loading) block = { reason: "missing", message: "Still reading the people and places it names." };
    return { lines, total: priced.total, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    const current = quote(proposal);
    if (current.block) return failedRun("Picture", current.block.message);
    const surface = currentDescribeSurface.value;
    const read = understand(proposal);
    if (surface === null || read.shape === null) return failedRun("Picture", "Select a picture in the book, then press Describe it.");

    let job;
    try {
      job = await render.start({ concept: read.concept, entities: read.scene.entities, size: read.shape.aiSize, noteId: null });
    } catch (e) {
      return failedRun("Picture", e instanceof Error ? e.message : "The picture could not be queued. Nothing was charged.");
    }
    if (job === null) return failedRun("Picture", "The likeness notice was not accepted, so nothing was painted and nothing was charged.");

    surface.start({ jobId: job.jobId, shape: read.shape.id });
    return {
      record: { type: "other", id: job.jobId, name: "Picture" },
      route: null,
      parts: [{ label: "Queued: it will paint into your book", ok: true, credits: spent(current.lines.find((l) => l.label === "Picture")) }],
    };
  }

  return { id: "picture_description", quote, run };
}

export default usePictureDescriptionAskAdapter;
