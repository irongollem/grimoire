import type { ChroniclerSize, ImageJobKind } from "@/types/chronicler.types";
import {
  captureImageGenerationContext,
  startImageGeneration as startCentralImageGeneration,
  getLocalImageJob as getCentralLocalImageJob,
} from "@/ai/useImageGeneration";
import { waitForImageJob } from "@/ai/useImageJob";
import type { ResolvedEntity } from "@/ai/sceneEntities";

// ── Image generation ──────────────────────────────────────────────────────────

// Local (BYOK) jobs never touch the DB — there is no row to poll — so an
// in-memory map is the only record of an in-flight local render. Entries are
// removed once the promise settles (either way); a page reload loses any
// still-pending entries, which is accepted (see task notes).
/** Looks up an in-flight local (BYOK) image render started by startChroniclerImage. */
export function getLocalImageJob(jobId: string): Promise<string> | undefined {
  return getCentralLocalImageJob(jobId);
}

/**
 * Kicks off a chronicle image render and returns immediately with a job id —
 * never awaits the render itself. Server mode: the edge function's job id.
 * Local (BYOK) mode: a synthetic `local-<uuid>` id backed by an in-memory
 * promise (see `localImageJobs` / `getLocalImageJob`), since there is no DB
 * row to poll for a client-side render.
 */
export async function startChroniclerImage(params: {
  sceneText: string;
  entities: ResolvedEntity[];
  size: ChroniclerSize;
  kind?: ImageJobKind;
  /** The saved note this render's anchor lives in — lets the server swap
   * the anchor into the note's content on completion (#614). */
  noteId?: string | null;
}): Promise<{ jobId: string }> {
  const { sceneText, entities, size, kind = "chronicler", noteId = null } = params;
  const imageContext = captureImageGenerationContext();
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
  entities: ResolvedEntity[];
  size: ChroniclerSize;
  kind?: ImageJobKind;
}): Promise<string> {
  const { jobId } = await startChroniclerImage(params);
  if (jobId.startsWith("local-")) {
    const promise = getLocalImageJob(jobId);
    if (!promise) throw new Error("Local image job not found.");
    return promise;
  }
  return waitForImageJob(jobId);
}
