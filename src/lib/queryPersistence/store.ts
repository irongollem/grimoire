/**
 * IndexedDB layer for the persisted query cache.
 *
 * One database, one object store, one record per query keyed by `queryHash`.
 * Hand-rolled (no idb wrapper, no query-persist-client-core) in the style of
 * `localKeyVault`: the surface needed is five calls, and the persister the
 * library ships serialises the WHOLE cache on every write, which is the wrong
 * shape for a cache with a 3,500-row array in it.
 *
 * Reads are by hash, one record at a time, so a query only ever pays for its
 * own bytes. Two indexes (`by_user`, `by_saved`) exist so that pruning can walk
 * keys alone: a key cursor never loads a record's data.
 *
 * Data is stored as-is via structured clone (no JSON round trip), so Dates,
 * Maps and undefined survive.
 */

const DB_NAME = "grimoire-query-cache";
const STORE_NAME = "queries";
const BY_USER = "by_user";
const BY_SAVED = "by_saved";

export interface PersistedQuery {
  hash: string;
  key: readonly unknown[];
  data: unknown;
  userId: string;
  buildId: string;
  savedAt: number;
}

export interface QueryStore {
  get(hash: string): Promise<PersistedQuery | undefined>;
  put(record: PersistedQuery): Promise<void>;
  clear(): Promise<void>;
  /** Delete every record written by anyone but `userId`, and every record saved before `olderThan`. */
  prune(userId: string, olderThan: number): Promise<void>;
  close(): void;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/** Rejects when IndexedDB is missing or the open fails; callers degrade to network-only. */
export function openQueryStore(): Promise<QueryStore> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "hash" });
        store.createIndex(BY_USER, "userId");
        store.createIndex(BY_SAVED, "savedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
    req.onblocked = () => reject(new Error("IndexedDB open blocked"));
  }).then((db) => {
    // A newer tab upgrading the schema must not be held up by this connection.
    db.onversionchange = () => db.close();
    return makeStore(db);
  });
}

/** Deletes every record whose index key falls in `range`, reading keys only. */
function deleteByKeyRange(store: IDBObjectStore, indexName: string, range: IDBKeyRange): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = store.index(indexName).openKeyCursor(range);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB cursor failed"));
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve();
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
  });
}

function makeStore(db: IDBDatabase): QueryStore {
  return {
    async get(hash) {
      const tx = db.transaction(STORE_NAME, "readonly");
      return (await requestToPromise(tx.objectStore(STORE_NAME).get(hash))) as PersistedQuery | undefined;
    },
    async put(record) {
      const tx = db.transaction(STORE_NAME, "readwrite");
      // put() throws synchronously on unclonable data; the transaction then
      // never completes work, so abort it rather than leave it open.
      try {
        tx.objectStore(STORE_NAME).put(record);
      } catch (error) {
        tx.abort();
        throw error;
      }
      await txDone(tx);
    },
    async clear() {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).clear();
      await txDone(tx);
    },
    async prune(userId, olderThan) {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const done = txDone(tx);
      await Promise.all([
        deleteByKeyRange(store, BY_USER, IDBKeyRange.upperBound(userId, true)),
        deleteByKeyRange(store, BY_USER, IDBKeyRange.lowerBound(userId, true)),
        deleteByKeyRange(store, BY_SAVED, IDBKeyRange.upperBound(olderThan, true)),
      ]);
      await done;
    },
    close() {
      db.close();
    },
  };
}
