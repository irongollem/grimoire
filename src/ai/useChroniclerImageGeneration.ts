import type { ChroniclerSize, ImageJobKind } from "@/types/chronicler.types";
import {
  captureImageGenerationContext,
  startImageGeneration as startCentralImageGeneration,
} from "@/ai/useImageGeneration";
import { waitForImageJob } from "@/ai/useImageJob";
import type { ResolvedSceneEntity } from "@/ai/sceneEntities";

// ── Image generation ──────────────────────────────────────────────────────────

/**
 * Kicks off a chronicle image render and returns immediately with a job id —
 * never awaits the render itself. The job id is the edge function's.
 */
export async function startChroniclerImage(params: {
  sceneText: string;
  entities: ResolvedSceneEntity[];
  size: ChroniclerSize;
  kind?: ImageJobKind;
  /** The saved note this render's anchor lives in — lets the server swap
   * the anchor into the note's content on completion (#614). */
  noteId?: string | null;
}): Promise<{ jobId: string }> {
  const { sceneText, entities, size, kind = "chronicler", noteId = null } = params;
  const imageContext = await captureImageGenerationContext();
  return startCentralImageGeneration({
    ...imageContext,
    purpose: kind === "group_portrait" ? "group_portrait" : "chronicler",
    subject: sceneText,
    size,
    referenceUrls: entities.flatMap((entity) => entity.portraitUrl ? [entity.portraitUrl] : []),
    textDescriptions: entities.flatMap((entity) => entity.textDescription ? [entity.textDescription] : []),
    noteId,
  });
}

/**
 * Awaits a full chronicle image render to completion. Builds on
 * startChroniclerImage — one code path for both the fire-and-forget
 * (Chronicler note) and await-to-completion (group portrait) callers.
 */
export async function generateChroniclerImage(params: {
  sceneText: string;
  entities: ResolvedSceneEntity[];
  size: ChroniclerSize;
  kind?: ImageJobKind;
}): Promise<string> {
  const { jobId } = await startChroniclerImage(params);
  return waitForImageJob(jobId);
}
