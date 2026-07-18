import { waitForRow } from "@/ai/waitForRow";

interface ImageJobRow {
  status: "pending" | "ready" | "failed";
  image_url: string | null;
  error: string | null;
}

/**
 * Waits for an async image_generation_jobs row to settle.
 * Subscribes via Realtime and polls every 4s as a fallback (waitForRow).
 * Resolves with the URL on `ready`, rejects on `failed` or timeout.
 */
export function waitForImageJob(
  jobId: string,
  opts: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<string> {
  // 8 min: gpt-image legitimately runs ~5 min on a busy day, so a tighter
  // window risks "timing out" a job that is about to succeed. A pg_cron sweep
  // is the authority that fails truly-stuck jobs (>10 min) — the client never
  // mutates job status, it only observes, so it can't clobber a late success.
  const timeoutMs = opts.timeoutMs ?? 8 * 60 * 1000;

  return waitForRow<ImageJobRow>({
    table: "image_generation_jobs",
    id: jobId,
    select: "status, image_url, error",
    resolveWhen: (row) => row.status === "ready" && !!row.image_url,
    rejectWhen: (row) => (row.status === "failed" ? (row.error ?? "Image generation failed") : null),
    timeoutMs,
    timeoutMessage:
      "This image is taking longer than expected. It may still finish and appear in your gallery shortly — if it doesn't, the job will be marked failed automatically and you can try again.",
    pollIntervalMs: opts.pollIntervalMs,
  }).then((row) => row.image_url as string);
}
