/**
 * Retry policy for the app's TanStack Query client.
 *
 * Extracted from `main.ts` so the predicates are testable — the cost of getting
 * one wrong is measured in seconds of spinner on every affected screen, which
 * is exactly the kind of thing that ships unnoticed.
 */

/** An in-flight request the app itself cancelled — worth one quick re-attempt. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * PostgREST answers a `.single()` that matched zero rows (or more than one)
 * with **PGRST116** and HTTP 406, and that is a *definitive* answer rather than
 * a transient failure.
 *
 * Retrying it is not merely wasted work — with exponential backoff it converts
 * an instant "no such row" into 1s + 2s + 4s of held loading state. And the
 * case is completely ordinary: a stale campaign id in `localStorage` after a
 * session expires, a bookmark into a deleted row, a link shared from another
 * account. Every one of those is an RLS-filtered read returning nothing, which
 * is the correct outcome and should be reported immediately.
 */
export function isMissingRowError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "PGRST116"
  );
}

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (isMissingRowError(error)) return false;
  if (isAbortError(error)) return failureCount < 2;
  return failureCount < 3;
}

export function queryRetryDelay(attemptIndex: number, error: unknown): number {
  if (isAbortError(error)) return 600 * (attemptIndex + 1);
  return Math.min(1000 * 2 ** attemptIndex, 30_000);
}
