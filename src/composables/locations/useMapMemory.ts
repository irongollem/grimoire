import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { supabase } from "@/lib/supabase";
import { decodeFogMask, encodeFogMask, type FogCellKey } from "@/lib/battlemap/fogMask";

/** One write to a map's memory, as the server applies it: forget first, then reveal, then hide. */
interface Batch {
  reveal: Set<FogCellKey>;
  hide: Set<FogCellKey>;
  forget: boolean;
}

function applyBatch(seen: ReadonlySet<FogCellKey>, batch: Batch): Set<FogCellKey> {
  const next = new Set(batch.forget ? [] : seen);
  for (const k of batch.reveal) next.add(k);
  for (const k of batch.hide) next.delete(k);
  return next;
}

/** `later` applied after `earlier`, as one batch. A square is never in both lists, so the server's order cannot flip it. */
function mergeBatch(earlier: Batch, later: Batch): Batch {
  if (later.forget) return { reveal: new Set(later.reveal), hide: new Set(later.hide), forget: true };
  const reveal = new Set(earlier.reveal);
  const hide = new Set(earlier.hide);
  for (const k of later.reveal) {
    reveal.add(k);
    hide.delete(k);
  }
  for (const k of later.hide) {
    hide.add(k);
    reveal.delete(k);
  }
  return { reveal, hide, forget: earlier.forget };
}

/**
 * Writes this app has sent or gathered for one map and not yet seen land, by query key. Module-level, because two
 * screens of one map share its cache; per map, so a batch is never sent with another map's id.
 */
interface Pending {
  inFlight: Promise<void> | null;
  /** The batch the request out now carries. */
  sending: Batch | null;
  /** Writes made while it is out: they go together in the next request. */
  queued: Batch | null;
  queuedDone: Promise<void> | null;
}
const pendingByKey = new Map<string, Pending>();
const keyOf = (cid: string, pid: string) => `${cid}/${pid}`;

/** What is still on its way, layered over what the server holds, so a refetch never shows a square fogged again. */
function withPending(seen: string, cid: string, pid: string): string {
  const pending = pendingByKey.get(keyOf(cid, pid));
  if (!pending || (!pending.sending && !pending.queued)) return seen;
  let cells = decodeFogMask(seen);
  if (pending.sending) cells = applyBatch(cells, pending.sending);
  if (pending.queued) cells = applyBatch(cells, pending.queued);
  return encodeFogMask(cells);
}

/**
 * What the party has seen of one place's map (`map_memory`, one row per campaign and place), shared by exploring
 * and every fight on that map. Another device's change arrives through the doorbell (`map_memory` signal), never
 * a poll. Writes go through `remember_map_cells`, which only the DM may call and which returns the new `seen`.
 */
export function useMapMemory(campaignId: MaybeRefOrGetter<string | null>, placeId: MaybeRefOrGetter<string | null>) {
  const queryClient = useQueryClient();
  const key = computed(() => ["map-memory", toValue(campaignId), toValue(placeId)] as const);

  const query = useQuery({
    queryKey: key,
    queryFn: async ({ queryKey: [, cid, pid] }) => {
      if (!cid || !pid) throw new Error("useMapMemory read without a campaign and place; enabled guarantees both");
      // Scoped by both ids here; RLS is only the ceiling.
      const { data, error } = await supabase
        .from("map_memory")
        .select("seen")
        .eq("campaign_id", cid)
        .eq("location_id", pid)
        .maybeSingle();
      if (error) throw error;
      // The writer's own write rings every tab, this one included: the re-read must not undo what is still queued.
      return withPending(data ? data.seen : "", cid, pid);
    },
    enabled: () => !!toValue(campaignId) && !!toValue(placeId),
  });

  const memory = computed<Set<FogCellKey>>(() => decodeFogMask(query.data.value));

  // A brush stroke asks for a write on every pointer move. Each write shows on this screen at once (the squares are
  // merged into the cache before the request goes), and while one request is out the next writes gather into one
  // batch, so a stroke costs a request at a time rather than one per frame. The server merges too, so the order
  // in which two windows' batches land does not matter.
  function write(batch: Batch): Promise<void> {
    const cid = toValue(campaignId);
    const pid = toValue(placeId);
    if (!cid || !pid) return Promise.reject(new Error("Cannot change the map's memory without a campaign and a place"));
    const cacheKey = ["map-memory", cid, pid] as const;
    queryClient.setQueryData<string>(cacheKey, (seen) => encodeFogMask(applyBatch(decodeFogMask(seen), batch)));
    let pending = pendingByKey.get(keyOf(cid, pid));
    if (!pending) {
      pending = { inFlight: null, sending: null, queued: null, queuedDone: null };
      pendingByKey.set(keyOf(cid, pid), pending);
    }
    const p = pending;
    if (p.inFlight) {
      p.queued = p.queued ? mergeBatch(p.queued, batch) : batch;
      p.queuedDone ??= p.inFlight.then(() => {
        const next = p.queued;
        p.queued = null;
        p.queuedDone = null;
        return next ? send(cid, pid, p, next) : undefined;
      });
      return p.queuedDone;
    }
    return send(cid, pid, p, batch);
  }

  function send(cid: string, pid: string, p: Pending, batch: Batch): Promise<void> {
    const cacheKey = ["map-memory", cid, pid] as const;
    p.sending = batch;
    const request = (async () => {
      const { data, error } = await supabase.rpc("remember_map_cells", {
        p_campaign_id: cid,
        p_location_id: pid,
        p_reveal: [...batch.reveal],
        p_hide: [...batch.hide],
        p_forget: batch.forget,
      });
      p.sending = null;
      if (error) {
        // What this screen showed early was never saved: read the row again rather than keep showing it.
        void queryClient.invalidateQueries({ queryKey: cacheKey });
        throw error;
      }
      // Writes gathered meanwhile are still to come: keep showing them over what the server holds now.
      queryClient.setQueryData<string>(cacheKey, withPending(data, cid, pid));
    })();
    // The queue waits on this, success or failure: a failed write still lets the gathered batch go.
    const settled: Promise<void> = request.then(
      () => undefined,
      () => undefined,
    ).finally(() => {
      if (p.inFlight === settled) p.inFlight = null;
      if (!p.inFlight && !p.queued && !p.sending) pendingByKey.delete(keyOf(cid, pid));
    });
    p.inFlight = settled;
    return request;
  }

  return {
    memory,
    isLoading: query.isLoading,
    async remember(cells: Iterable<FogCellKey>) {
      const reveal = new Set(cells);
      if (reveal.size === 0) return;
      await write({ reveal, hide: new Set(), forget: false });
    },
    async hide(cells: Iterable<FogCellKey>) {
      const hide = new Set(cells);
      if (hide.size === 0) return;
      await write({ reveal: new Set(), hide, forget: false });
    },
    forgetAll: () => write({ reveal: new Set(), hide: new Set(), forget: true }),
    replaceWith: (cells: Iterable<FogCellKey>) => write({ reveal: new Set(cells), hide: new Set(), forget: true }),
  };
}
