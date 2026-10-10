/**
 * Runs a ring's follow-up read without leaving an unhandled rejection behind.
 * A ring listener cannot await, so its promise is dropped; if the read throws,
 * the error is rethrown from a timer, which is the one route that reliably
 * reaches Sentry (a console-level throw does not).
 */
export function reportAsync(promise: Promise<unknown>): void {
  promise.catch((error: unknown) => {
    setTimeout(() => {
      throw error;
    });
  });
}
