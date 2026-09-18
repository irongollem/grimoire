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
  if (error) throw new Error((data as { error?: string } | null)?.error ?? error.message);
  if ((data as { error?: string } | null)?.error) throw new Error((data as { error: string }).error);
  return data as T;
}
