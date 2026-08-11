/**
 * The one place that knows where `supabase.functions.invoke` puts an edge
 * function's error body.
 *
 * The quirk: when a function returns a non-2xx status, supabase-js gives you a
 * `FunctionsHttpError` whose `.message` is the generic "Edge Function returned a
 * non-2xx status code" — the JSON body you actually care about is on
 * `.context`, an unread `Response`. Every caller that wants the server's error
 * code has to know that, and three of them had each worked it out separately
 * (`useAccountDeletion`, `useAdminRefunds`, and then `useDataExport`), with the
 * first one's docblock claiming the knowledge lived in exactly one place.
 *
 * It has changed shape before, which is the reason to have one owner rather
 * than three copies that drift apart on the next change.
 */

/**
 * The parsed JSON error body, or null when the response had none (a network
 * failure, a gateway error page, an empty body). Never throws: a caller in an
 * error path should not have to handle a second error from reading the first.
 */
export async function functionErrorPayload<T = { error?: string }>(
  error: unknown,
): Promise<T | null> {
  try {
    const context = (error as { context?: Response } | null)?.context;
    return ((await context?.json()) as T) ?? null;
  } catch {
    return null;
  }
}

/**
 * The server's error code, falling back to the client-side message when the
 * response carried no JSON body. The fallback matters: a network failure has no
 * body at all, and reporting an empty string there would replace a real
 * diagnosis with silence.
 */
export async function functionErrorCode(error: { message?: string } | null): Promise<string> {
  const payload = await functionErrorPayload(error);
  return payload?.error ?? error?.message ?? "Unknown error";
}
