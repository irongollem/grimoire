/**
 * Ask Grimoire (#1270): a scene illustration for the open note, as a quote and a run.
 *
 * A note's toolbar opens this card (the note as `target`), and so does a suggestion chip in the text, which brings its
 * prompt as the scene. The price is the old dialog's (`chronicle_image`, by the shape's output area), the gates are its,
 * and the run is its: the likeness notice when a mention carries a picture, then a queued render (`startChroniclerImage`).
 * The render is never awaited: its anchor is dropped into the note at the cursor (or in place of the suggestion the DM
 * clicked) by the open editor (`NoteSurface.insertScene`) and the server swaps the picture in when it is done, also in
 * a note not saved yet.
 */
import type { AskProposal } from "@edge-shared/agent/askContract";
import type { AskAdapter, AskQuote, AskQuoteLine, AskRunResult } from "@/lib/ask/askAdapter";
import { conceptBlock, failedRun, matchOption, spent } from "@/ai/ask/adapters/askAdapterKit";
import { askString, readAskInputs } from "@/ai/ask/askInputs";
import { useAskGate } from "@/ai/ask/useAskGate";
import { useAskSceneRender } from "@/ai/ask/askSceneRender";
import { AI_PROMPT_LIMIT_SHORT } from "@/ai/utils";
import type { SceneShape } from "@/types/chronicler.types";
import { useCampaignStore } from "@/stores/campaign";
import { useSceneIllustrationQuote } from "@/composables/ai/quotes/sceneIllustrationQuote";
import { currentNoteSurface } from "@/composables/notes/useNoteSurface";
import { noteSurfaceBlock } from "@/ai/ask/adapters/noteSurfaceKit";

/** The notes' shapes: the oblong painted, which is what the price follows. */
const NOTE_SHAPES: readonly SceneShape[] = [
  { id: "square", label: "Square", size: "1024x1024" },
  { id: "landscape", label: "Landscape", size: "1536x1024" },
];

export function useSceneIllustrationAskAdapter(): AskAdapter {
  const campaign = useCampaignStore();
  const priceOf = useSceneIllustrationQuote();
  const { blockFor } = useAskGate(null, "picture");
  const render = useAskSceneRender();

  function understand(proposal: AskProposal) {
    const inputs = readAskInputs("scene_illustration", proposal.inputs);
    const shape = NOTE_SHAPES.find((s) => s.id === matchOption(askString(inputs, "shape"), NOTE_SHAPES)) ?? NOTE_SHAPES[0];
    const concept = proposal.concept.trim();
    return { shape, concept, scene: render.read(concept) };
  }

  /** Why the open note cannot take a picture, or null: none open, or another note than the one the card is for. */
  function noteBlock(proposal: AskProposal): string | null {
    return noteSurfaceBlock(proposal, "paint into");
  }

  function quote(proposal: AskProposal): AskQuote {
    const read = understand(proposal);
    const priced = priceOf(read.shape.size);
    const surface = currentNoteSurface.value;
    const lines: AskQuoteLine[] = [
      { label: "Into", value: proposal.target?.name ?? (surface?.title().trim() || "This note"), credits: null },
      { label: "Shape", value: read.shape.label, credits: null },
      ...(read.scene.line ? [read.scene.line] : []),
      { label: "Campaign", value: campaign.activeCampaign?.name ?? "This campaign", credits: null },
      ...priced.lines,
    ];
    let block = blockFor({ total: priced.total });
    block = block ?? conceptBlock(read.concept, "scene", { empty: "Describe the scene first.", limit: AI_PROMPT_LIMIT_SHORT, shorten: "scene" });
    const closed = noteBlock(proposal);
    if (!block && closed !== null) block = { reason: "missing", message: closed };
    if (!block && read.scene.loading) block = { reason: "missing", message: "Still reading the people and places it names." };
    return { lines, total: priced.total, block };
  }

  async function run(proposal: AskProposal): Promise<AskRunResult> {
    const current = quote(proposal);
    if (current.block) return failedRun("Picture", current.block.message);
    const surface = currentNoteSurface.value;
    if (surface === null) return failedRun("Picture", "Open the note to paint into first.");
    const read = understand(proposal);

    let job;
    try {
      job = await render.start({ concept: read.concept, entities: read.scene.entities, size: read.shape.size, noteId: surface.noteId() });
    } catch (e) {
      return failedRun("Picture", e instanceof Error ? e.message : "The picture could not be queued. Nothing was charged.");
    }
    if (job === null) return failedRun("Picture", "The likeness notice was not accepted, so nothing was painted and nothing was charged.");

    // The editor closed while the render was being queued: the job is paid for and runs, but there is no note to anchor it in.
    if (currentNoteSurface.value !== surface) {
      return { record: null, route: null, parts: [{ label: "Queued, but the note was closed before the picture could be placed in it", ok: true, credits: spent(current.lines.find((l) => l.label === "Picture")) }] };
    }
    surface.insertScene({ jobId: job.jobId, prompt: read.concept, size: read.shape.size });
    return {
      record: { type: "note", id: surface.noteId() ?? "unsaved", name: "Scene illustration" },
      route: null,
      parts: [{ label: "Queued: it will paint into your note", ok: true, credits: spent(current.lines.find((l) => l.label === "Picture")) }],
    };
  }

  return { id: "scene_illustration", quote, run };
}

export default useSceneIllustrationAskAdapter;
