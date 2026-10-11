import type { ErrorEvent } from "@sentry/vue";

/**
 * Errors that are not `Error`s — almost always a supabase-js `error` thrown as is.
 *
 * postgrest-js hands back a plain `{ message, details, hint, code }` object when
 * the fetch itself fails (only `.throwOnError()` wraps it in a `PostgrestError`),
 * so `if (error) throw error` throws something with no stack and no class. Sentry
 * then titles the event "Object captured as exception with keys: code, details,
 * hint, message", builds a stack out of its own frames, and files every such
 * throw in the app under one issue named `captureException`. Worse, `ignoreErrors`
 * matches that synthetic title rather than the message, so a dropped connection
 * sails past the `NetworkError` / `Load failed` rules written to stop it
 * (DUNGEON-GRIMOIRE-J, 11 Oct 2026: a Firefox player losing the network on
 * `/play/fallen`).
 *
 * This reads the object's own message instead: ignored when it matches the same
 * list a real `Error` would be ignored by, and otherwise titled and grouped by
 * what it says.
 */

/** The message of a thrown value that is an error in shape but not in class. */
export function plainErrorMessage(value: unknown): string | null {
  if (value instanceof Error || typeof value !== "object" || value === null) return null;
  const message = (value as { message?: unknown }).message;
  return typeof message === "string" && message !== "" ? message : null;
}

/** Sentry's `ignoreErrors` semantics: a string matches as a substring, a RegExp by test. */
export function matchesIgnored(message: string, ignored: readonly (string | RegExp)[]): boolean {
  return ignored.some((rule) => (typeof rule === "string" ? message.includes(rule) : rule.test(message)));
}

/**
 * Drop a plain-object error the ignore list covers, or retitle and regroup it by
 * its message and code. Returns the event unchanged when the original was a real
 * `Error` (or anything without a message), which the SDK already handles.
 */
export function classifyPlainError(
  event: ErrorEvent,
  original: unknown,
  ignored: readonly (string | RegExp)[],
): ErrorEvent | null {
  const message = plainErrorMessage(original);
  if (message === null) return event;
  if (matchesIgnored(message, ignored)) return null;

  const code = (original as { code?: unknown }).code;
  const codeText = typeof code === "string" ? code : "";
  const exception = event.exception?.values?.[0];
  if (exception) {
    exception.type = codeText ? `PostgrestError ${codeText}` : "PostgrestError";
    exception.value = message;
  }
  // The stack is Sentry's own frames, identical for every such throw, so it
  // cannot tell two of them apart; the code and message can.
  event.fingerprint = ["plain-object-error", codeText, message];
  return event;
}
