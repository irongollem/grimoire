import { supabase } from "@/lib/supabase";
import { reportHandledError } from "@/lib/observability/sentry";

/**
 * How long a canon entry's edits must go quiet before its embedding is queued (#1226). Canon forms autosave, so a DM
 * typing a title or a body fires a write every second or two, and each changes the entry's embed text. Trailing, so
 * the vector is built from what the DM finished typing.
 */
export const CANON_EMBED_DEBOUNCE_MS = 5000;

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * Queue a canon entry for the by-meaning lookup (#1226). Call it after ANY write to `canon_entries` (title, body, wants)
 * or to a lore entry's `canon_lore_passages` (heading, text; the entry's one vector folds its passages in), including
 * inserts. Fire-and-forget and never rejects: the write has already committed, so a failed embed only leaves the entry
 * for the admin backfill. Debounced per entry; the edge function short-circuits on an unchanged text hash.
 */
export function queueCanonEmbedding(entryId: string): void {
  const existing = pending.get(entryId);
  if (existing !== undefined) clearTimeout(existing);
  pending.set(
    entryId,
    setTimeout(() => {
      pending.delete(entryId);
      void Promise.resolve(
        supabase.functions.invoke("embed-content", { body: { mode: "single", entity: "canon", id: entryId } }),
      )
        .then(({ error }) => {
          if (error) reportHandledError(error, "queueCanonEmbedding", { entryId });
        })
        .catch((error) => reportHandledError(error, "queueCanonEmbedding", { entryId }));
    }, CANON_EMBED_DEBOUNCE_MS),
  );
}
