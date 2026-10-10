/**
 * Persisted query cache: a TanStack `persister` that answers a listed query
 * from IndexedDB the first time it is fetched in a page session, and writes the
 * network answer back after every fetch.
 *
 * The cache is lazy on purpose. The first design hydrated every stored record
 * into the query client before the app mounted, which cost twice:
 *
 *   1. The mount waited on one `getAll` of every stored library list, several
 *      megabytes once a DM has a few campaigns with different source sets, so
 *      the restore delayed first paint.
 *   2. A restored list nobody was observing was garbage-collected from memory
 *      after `gcTime`, and then downloaded from the network anyway when its page
 *      was finally opened, although it was still on disk.
 *
 * Installed as `defaultOptions.queries.persister`, this wraps every queryFn, so
 * a query reads only its own record and only when it is about to fetch.
 *
 * This module is policy-free: the caller's `shouldPersist` decides which keys
 * are listed and in which class. The classes and the reasoning for them live in
 * `policy.ts`:
 *
 *   - `static`: shared library content. A record is trusted for a day and a
 *     build, and is refetched in the background only past that.
 *   - `live` (#999): campaign data the live channel keeps current. A record is
 *     painted from disk at once and ALWAYS revalidated straight away, because
 *     other people changed it while this device was away.
 *
 * Rules worth knowing before you change anything here:
 *
 *   - An unlisted key, or no signed-in user, runs the queryFn untouched: no
 *     extra await, no storage access. Most queries in the app take this path.
 *   - A record belongs to ONE user and is only served to that user. `prune`
 *     deletes everyone else's records when a new account signs in, `clear`
 *     empties the store on sign-out.
 *   - Disk is read only when the query holds no data (its first fetch this page
 *     session, or after garbage collection). A refetch, with data present, always
 *     goes to the network, so `staleTime` and invalidation keep their meaning.
 *   - A `static` record from another build, or older than a day, is returned at
 *     once and refetched in the background, even for a `staleTime: Infinity`
 *     query. A `live` record is returned and refetched whatever its age. A
 *     record older than a week is a miss, in either class.
 *   - Writes are fire-and-forget and never affect the data the query returns.
 *     An empty list and ephemeral data (ephemeral.ts) are never written.
 *   - Nothing here throws anything the queryFn did not throw. No IndexedDB, a
 *     blocked open or a failing read is a miss, and the app runs network-only.
 */
import type { QueryPersister } from "@tanstack/vue-query";
import { containsEphemeral } from "./ephemeral";
import { indexedDbFactory, openQueryStore } from "./store";
import type { QueryStore } from "./store";

const HOUR_MS = 60 * 60 * 1000;
/** Older than this: a miss, and pruned. */
const MAX_AGE_MS = 7 * 24 * HOUR_MS;
/** Older than this: returned, then refetched in the background. */
const REFRESH_AFTER_MS = 24 * HOUR_MS;

/** How a persisted key is trusted when it comes back from disk. See the header. */
export type PersistClass = "static" | "live";

export interface QueryPersistenceOptions {
  /** Identifies the running build. A record written by another build is shown, then refetched. */
  buildId: string;
  /** The signed-in user id, or null. Read on every fetch; never cached here. */
  getUserId: () => string | null;
  /** Which class a key is persisted in, or null for "not at all" (policy.ts). */
  shouldPersist: (queryKey: readonly unknown[]) => PersistClass | null;
  /** Called with any unexpected storage error. The module itself never throws into the app. */
  onError?: (error: unknown) => void;
  now?: () => number;
}

export interface QueryPersistence {
  /** Install as `defaultOptions.queries.persister`. */
  persister: QueryPersister;
  /** Delete everything on disk (sign-out, signed-out boot). Never rejects. */
  clear(): Promise<void>;
  /** Delete records written by anyone but `userId`, and records older than 7 days. Never rejects. */
  prune(userId: string): Promise<void>;
  /**
   * Begin opening the database now instead of at the first persisted read. On a
   * device that has never opened it, the open creates the database, which under
   * a throttled CPU is long enough that every persisted query queued behind it
   * visibly trails the unpersisted ones. Idempotent, never rejects, and a
   * failed open is reported and degrades to network-only exactly as a lazy one.
   */
  warm(): Promise<void>;
}

/**
 * An empty list is never stored. It costs nothing to ask for again, and an
 * answer that was empty for the wrong reason (sources not loaded yet, a read
 * that slipped past as anonymous) must not be served from disk for a day when
 * the same mistake in memory ends with the page session.
 */
function isWorthStoring(data: unknown): boolean {
  if (Array.isArray(data) && data.length === 0) return false;
  return !containsEphemeral(data);
}

export function createQueryPersistence(options: QueryPersistenceOptions): QueryPersistence {
  const now = options.now ?? Date.now;
  const report = (error: unknown) => {
    try {
      options.onError?.(error);
    } catch {
      // A throwing reporter must not break the never-throw promise.
    }
  };

  /** Set once the store failed to open: every later fetch takes the untouched path. */
  let unavailable = false;
  let storePromise: Promise<QueryStore | null> | null = null;
  function getStore(): Promise<QueryStore | null> {
    storePromise ??= openQueryStore().catch((error: unknown) => {
      unavailable = true;
      // Missing IndexedDB is normal (SSR, some private modes); anything else is worth hearing about.
      if (indexedDbFactory()) report(error);
      return null;
    });
    return storePromise;
  }

  async function fromDisk(hash: string, userId: string, persistClass: PersistClass): Promise<{ data: unknown; stale: boolean } | null> {
    try {
      const store = await getStore();
      if (!store) return null;
      const record = await store.get(hash);
      if (!record || record.userId !== userId) return null;
      const age = now() - record.savedAt;
      if (age > MAX_AGE_MS) return null;
      const stale = persistClass === "live" || record.buildId !== options.buildId || age > REFRESH_AFTER_MS;
      return { data: record.data, stale };
    } catch (error) {
      report(error);
      return null;
    }
  }

  async function toDisk(
    hash: string,
    key: readonly unknown[],
    data: unknown,
    userId: string,
  ): Promise<void> {
    try {
      const store = await getStore();
      if (!store) return;
      await store.put({ hash, key, data, userId, buildId: options.buildId, savedAt: now() });
    } catch (error) {
      // A clone failure lands here too; the query keeps its data either way.
      report(error);
    }
  }

  const persister: QueryPersister = (queryFn, context, query) => {
    const userId = options.getUserId();
    const persistClass = unavailable || userId === null ? null : options.shouldPersist(query.queryKey);
    if (userId === null || persistClass === null) return queryFn(context);

    const network = async (): Promise<unknown> => {
      const data = await queryFn(context);
      // The user may have changed while the request was out; it is then not theirs to store.
      if (options.getUserId() === userId && isWorthStoring(data)) {
        void toDisk(query.queryHash, query.queryKey, data, userId);
      }
      return data;
    };

    // Data present means a refetch: the network answers, never the disk.
    if (query.state.data !== undefined) return network();

    return fromDisk(query.queryHash, userId, persistClass).then((hit) => {
      if (!hit) return network();
      if (hit.stale) {
        // Once the data below has landed, the refetch has data present and goes to the network.
        // (For a live key this runs every time, so the network corrects the disk
        // copy at once instead of waiting for the query to go stale.)
        setTimeout(() => {
          void context.client.invalidateQueries({ queryKey: query.queryKey, exact: true });
        }, 0);
      }
      return hit.data;
    });
  };

  async function clear(): Promise<void> {
    try {
      const store = await getStore();
      await store?.clear();
    } catch (error) {
      report(error);
    }
  }

  async function prune(userId: string): Promise<void> {
    try {
      const store = await getStore();
      await store?.prune(userId, now() - MAX_AGE_MS);
    } catch (error) {
      report(error);
    }
  }

  async function warm(): Promise<void> {
    await getStore();
  }

  return { persister, clear, prune, warm };
}
