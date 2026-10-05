import { supabase } from "@/lib/supabase";
import { functionErrorPayload } from "@edge-shared/functionError.ts";
import { reportHandledError } from "@/lib/observability/sentry";
import { chunkArray } from "@/lib/utils";

/**
 * Embeds a bulk-created set of rows in batched edge calls (#972): one
 * `embed-content` `many` request per `EMBED_MANY_CHUNK` ids, instead of one
 * `single` request per row. The server embeds each chunk in ONE provider call
 * and charges the daily allowance one unit per stale row, so 150 new NPCs cost
 * 2 requests rather than 150.
 *
 * Never rejects: a bulk create has already committed its rows, and a failed
 * embed only leaves them for the next backfill sweep (the same trade the
 * single-row helpers make). Failures are reported, counted and returned.
 * Chunks run one after another, so a run is never more than one provider call
 * in flight, and the first `rate_limited` stops the rest: the ceiling is the
 * account's, and every later chunk would hit it too.
 *
 * Monsters embed through their own function, `embed-monsters`, whose `many`
 * mode takes `monster_ids` and answers in the same shape, so they share every
 * rule above.
 */

/** Matches the server's per-call cap (MANY_MAX_IDS in _shared/embedMany.ts). */
export const EMBED_MANY_CHUNK = 100;

export type EmbedManyEntity = "npc" | "faction" | "location" | "note" | "item" | "monster";

export interface QueueEmbeddingsResult {
  /** Ids the server embedded. */
  embedded: number;
  /** Ids in chunks the server answered, embedded or already current. */
  processed: number;
  /** Ids whose chunk failed outright (network, provider, storage). */
  failed: number;
  /** True when the daily allowance stopped the run; later chunks were not sent. */
  rateLimited: boolean;
}

interface ManyResponse {
  embedded?: string[];
  unchanged?: string[];
}

/** Which function and body shape embeds a chunk of this entity. */
function manyRequest(entity: EmbedManyEntity, ids: string[]): { fn: string; body: Record<string, unknown> } {
  return entity === "monster"
    ? { fn: "embed-monsters", body: { mode: "many", monster_ids: ids } }
    : { fn: "embed-content", body: { mode: "many", entity, ids } };
}

export async function queueEmbeddings(
  entity: EmbedManyEntity,
  ids: readonly string[],
  /** Called after each chunk settles with how many ids are now handled, for progress UIs. */
  onProgress?: (handled: number) => void,
): Promise<QueueEmbeddingsResult> {
  const result: QueueEmbeddingsResult = { embedded: 0, processed: 0, failed: 0, rateLimited: false };
  let handled = 0;
  for (const chunk of chunkArray([...new Set(ids)], EMBED_MANY_CHUNK)) {
    try {
      const request = manyRequest(entity, chunk);
      const { data, error } = await supabase.functions.invoke(request.fn, { body: request.body });
      if (error) {
        const payload = await functionErrorPayload(error);
        if (payload?.error === "rate_limited") {
          result.rateLimited = true;
          return result;
        }
        throw new Error(payload?.error ?? error.message);
      }
      // A child account is answered `{ skipped }` with nothing embedded.
      result.embedded += (data as ManyResponse | null)?.embedded?.length ?? 0;
      result.processed += chunk.length;
    } catch (e) {
      result.failed += chunk.length;
      reportHandledError(e, "queueEmbeddings", { entity, count: chunk.length });
    }
    handled += chunk.length;
    onProgress?.(handled);
  }
  return result;
}

/** Fire-and-forget form for a bulk create: starts the run and never rejects. */
export function queueEmbeddingsInBackground(entity: EmbedManyEntity, ids: readonly string[]): void {
  if (ids.length === 0) return;
  void queueEmbeddings(entity, ids);
}
