// When a tile-pack job that says `generating` is really dead.
//
// A slot is claimed (`pending` -> `generating`) before the provider call and
// released by the same request when the call returns or throws. A request the
// edge runtime kills outright (wall-clock limit, a deploy, an OOM) does
// neither, so the row says `generating` forever: nothing picks it up, cancel
// waits on it, and the run can never leave its phase.
//
// No request lives past the edge runtime's 400 s wall clock, so a claim that
// has not moved in ten minutes belongs to a request that no longer exists.
// Shared by the edge function (cancel and retry treat such a job as dead) and
// the two run surfaces (which offer Retry on it), so both sides agree on the
// line. The dependency runs edge -> src, as with generationBudget.ts.

export const STALLED_AFTER_MS = 10 * 60 * 1000;

/** The instant before which an unchanged `generating` claim is dead. */
export function stalledBefore(now: number = Date.now()): string {
  return new Date(now - STALLED_AFTER_MS).toISOString();
}

/** Whether a job's claim outlived any request that could still finish it. */
export function isStalled(job: { status: string; updated_at: string }, now: number = Date.now()): boolean {
  return job.status === "generating" && Date.parse(job.updated_at) < now - STALLED_AFTER_MS;
}

/** A job the run surfaces should offer Retry on, and the reason to show. */
export function retryReason(job: { status: string; updated_at: string; error: string | null }, now: number = Date.now()): string | null {
  if (job.status === "failed") return job.error ?? "Generation failed";
  if (isStalled(job, now)) return "The generation call never returned";
  return null;
}
