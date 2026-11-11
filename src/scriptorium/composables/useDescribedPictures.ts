/*
 * A picture painted from a description, landing in the book (#1176, "Describe it").
 *
 * The picture is marked as painting (the job id and the shape asked for, saved with the chapter), the job
 * is waited for, and the painted file becomes the picture's `src` with the shape's centred crop as its
 * recipe. The writer keeps writing meanwhile, so the picture is found again by its block id (an image) or
 * its own id (art), never by the position it had. A mark that outlives a reload is picked up by resume().
 */
import { getLocalImageJob } from "@/ai/useChroniclerImageGeneration";
import { waitForImageJob } from "@/ai/useImageJob";
import { useToast } from "@/composables/useToast";
import { describeShapes, shapeById, type DescribeShape } from "@/scriptorium/lib/describeShapes";
import { treatmentPatch } from "@/scriptorium/lib/panel/pictureTreatment";
import type { PendingPicture, PictureActions, PictureKey, PictureTarget } from "@/scriptorium/composables/useEditorPictures";

interface Options {
  pictures: PictureActions;
  /** The book's page, width over height: the Full page shape is cut to it. */
  pageAspect: () => number;
  /** Waits for a job to give its picture's URL; swapped in tests. */
  wait?: (jobId: string) => Promise<string>;
}

/** A server job is polled for; a local (BYOK) one lives in memory and does not survive a reload. */
export function waitForJob(jobId: string): Promise<string> {
  if (!jobId.startsWith("local-")) return waitForImageJob(jobId);
  const local = getLocalImageJob(jobId);
  return local ?? Promise.reject(new Error("The picture was being made on this device and was lost when the page reloaded."));
}

export function useDescribedPictures(opts: Options) {
  const toast = useToast();
  const wait = opts.wait ?? waitForJob;
  /** Jobs this editor is already waiting on, so a resume never waits twice. */
  const waiting = new Set<string>();

  function shapes(): DescribeShape[] {
    return describeShapes(opts.pageAspect());
  }

  async function land(pending: PendingPicture) {
    if (waiting.has(pending.jobId)) return;
    waiting.add(pending.jobId);
    try {
      const url = await wait(pending.jobId);
      const target = opts.pictures.targetOf(pending.key);
      // The picture was deleted while it painted: nothing to land on.
      if (!target) return;
      opts.pictures.replaceSrc(target, url);
      const crop = shapeById(shapes(), pending.shape)?.crop ?? null;
      const now = opts.pictures.targetOf(pending.key);
      const values = now ? opts.pictures.valuesOf(now) : null;
      if (now && values && crop) opts.pictures.treat(now, treatmentPatch(values, { v: 1, seed: 1, steps: [crop] }));
      const last = opts.pictures.targetOf(pending.key);
      if (last) opts.pictures.markPending(last, null);
    } catch (e: unknown) {
      const target = opts.pictures.targetOf(pending.key);
      if (target) opts.pictures.markPending(target, null);
      toast.error(e instanceof Error ? `The picture could not be painted: ${e.message}` : "The picture could not be painted.");
    } finally {
      waiting.delete(pending.jobId);
    }
  }

  /** A render has been queued for this picture: mark it and wait. */
  function start(target: PictureTarget, job: { jobId: string; shape: string }) {
    const key: PictureKey | null = opts.pictures.keyOf(target);
    if (!key) {
      toast.error("This picture has no place in the chapter yet. Click into the text and try again.");
      return;
    }
    opts.pictures.markPending(target, job);
    void land({ key, jobId: job.jobId, shape: job.shape });
  }

  /** Pick up every picture still marked as painting, after a reload. */
  function resume() {
    for (const pending of opts.pictures.pendingPictures()) void land(pending);
  }

  return { start, resume, shapes };
}
