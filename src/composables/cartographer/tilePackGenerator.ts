import { supabase } from "@/lib/supabase";

/**
 * Call the `tile-pack-generator` edge function and surface its error text.
 *
 * Shared by the two composables that drive that function — `useTilePacks` (a
 * DM's own packs) and `useLibraryTilePacks` (shared, admin-authored ones) —
 * because the unwrapping is the non-obvious part and is easy to get subtly
 * wrong in a second copy: the function answers a refusal with HTTP 4xx AND a
 * JSON `{ error }` body, so `error.message` alone reports "Edge Function
 * returned a non-2xx status code" and throws away the reason the UI needs to
 * show. Both branches below exist for that, not for symmetry.
 *
 * Lives here rather than in `src/cartographer/` even though it is not a
 * composable, and the distinction is worth stating because a reviewer has
 * already reached for the other answer: every one of the ~30 modules in
 * `src/cartographer/` is backend-free — not one imports `@/lib/supabase` — so
 * that folder stays unit-testable with no network and no client. `cloneManifest`
 * (pure) belongs there; this makes a network call and would be the first module
 * to break the property. The line is what the module touches, not whether its
 * name starts with `use`.
 */
export async function invokeTilePackGenerator<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("tile-pack-generator", { body });
  const payload = data as Record<string, unknown> | null;
  // The body's code wins over the transport message in BOTH branches: a
  // refusal arrives as a 4xx *and* a JSON `{ error }`, so `error.message` is
  // only ever the fallback for a call that failed before the function replied.
  const code = typeof payload?.error === "string" ? payload.error : null;
  if (error) throw edgeFailure(payload, code ?? error.message);
  if (code) throw edgeFailure(payload, code);
  return data as T;
}

/**
 * Build the Error a refusal becomes, carrying the rest of the body with it.
 *
 * A refusal is not always just a code. `publish_library_pack` answers
 * `{ error: "pack_incomplete", required, requiredDrawn }`, and those two
 * numbers are the whole difference between "this pack is incomplete" and
 * "6 required slots are still blank" — which is the sentence
 * `describeLibraryPackError` is written to produce. `new Error(code)` drops
 * them silently, so every field but `error` is copied onto the Error and the
 * detail survives as far as the UI.
 *
 * Worth stating because a unit test cannot catch the regression: a test that
 * constructs the error object itself will pass whether or not this function
 * preserves anything, so the assertion that matters is the one over THIS
 * function, not over the describer.
 */
function edgeFailure(payload: Record<string, unknown> | null, message: string): Error {
  const failure = new Error(message);
  for (const [key, value] of Object.entries(payload ?? {})) {
    if (key !== "error") Object.assign(failure, { [key]: value });
  }
  return failure;
}
