/**
 * Coalesces many "fetch this one row by id" calls into few `.in("id", ids)` requests.
 *
 * Some screens render one component per row and each row owns a by-id query, so
 * twenty rows send twenty requests. The per-id TanStack keys are load-bearing
 * (live sync and cache seeding address rows through them), so they stay as they
 * are and the batching happens underneath, in the network layer: every id asked
 * for within one window leaves as a single request per chunk.
 *
 * The window is a macrotask, not a microtask. TanStack starts the queries of one
 * render across several microtask turns, so a microtask-length window would close
 * after the first row and batch nothing.
 *
 * A failed request rejects every caller waiting on it. It is never resolved as
 * "absent": a row that could not be read is not a row that does not exist, and
 * collapsing the two is how an outage turns into a screen of "???".
 */

/** PostgREST puts `.in()` ids in the URL; ~100 ids of 36 characters stays well inside any limit. */
const DEFAULT_MAX_BATCH = 100;

interface Waiter<T> {
  resolve: (row: T | null) => void;
  reject: (reason: unknown) => void;
}

export interface IdBatcher<T> {
  /** One row by id; `null` when the request succeeded and no row has that id. */
  load: (id: string) => Promise<T | null>;
  /** Many rows by id; ids with no row are absent from the map. Rejects if any chunk fails. */
  loadMany: (ids: readonly string[]) => Promise<Map<string, T>>;
}

export function createIdBatcher<T>(options: {
  fetchMany: (ids: string[]) => Promise<T[]>;
  idOf: (row: T) => string;
  maxBatch?: number;
}): IdBatcher<T> {
  const { fetchMany, idOf } = options;
  const maxBatch = options.maxBatch ?? DEFAULT_MAX_BATCH;
  let pending = new Map<string, Waiter<T>[]>();
  let scheduled = false;

  async function runChunk(chunk: [string, Waiter<T>[]][]): Promise<void> {
    try {
      const rows = await fetchMany(chunk.map(([id]) => id));
      const byId = new Map(rows.map((row) => [idOf(row), row]));
      for (const [id, waiters] of chunk) {
        const row = byId.get(id) ?? null;
        for (const waiter of waiters) waiter.resolve(row);
      }
    } catch (error) {
      for (const [, waiters] of chunk) for (const waiter of waiters) waiter.reject(error);
    }
  }

  function flush(): void {
    const batch = [...pending.entries()];
    pending = new Map();
    scheduled = false;
    for (let i = 0; i < batch.length; i += maxBatch) void runChunk(batch.slice(i, i + maxBatch));
  }

  function load(id: string): Promise<T | null> {
    return new Promise<T | null>((resolve, reject) => {
      const waiters = pending.get(id);
      if (waiters) waiters.push({ resolve, reject });
      else pending.set(id, [{ resolve, reject }]);
      if (!scheduled) {
        scheduled = true;
        setTimeout(flush, 0);
      }
    });
  }

  async function loadMany(ids: readonly string[]): Promise<Map<string, T>> {
    const unique = [...new Set(ids)];
    const rows = await Promise.all(unique.map(load));
    const out = new Map<string, T>();
    unique.forEach((id, index) => {
      const row = rows[index];
      if (row !== null) out.set(id, row);
    });
    return out;
  }

  return { load, loadMany };
}
