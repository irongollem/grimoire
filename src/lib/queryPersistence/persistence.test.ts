import { describe, it, expect, beforeEach, vi } from "vitest";
import "fake-indexeddb/auto";
import { QueryClient, QueryObserver } from "@tanstack/vue-query";
import { createQueryPersistence } from "./persistence";
import type { PersistClass, QueryPersistence } from "./persistence";
import { openQueryStore } from "./store";
import type { PersistedQuery } from "./store";

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;
const BUILD = "build-1";
const LISTED = ["library-monsters", "a"] as const;
const HASH = JSON.stringify(LISTED);
const LIVE = ["quests", "c1"] as const;
const LIVE_HASH = JSON.stringify(LIVE);

async function withStore<T>(fn: (s: Awaited<ReturnType<typeof openQueryStore>>) => Promise<T>): Promise<T> {
  const store = await openQueryStore();
  try {
    return await fn(store);
  } finally {
    store.close();
  }
}
const readRecord = (hash = HASH) => withStore((s) => s.get(hash));
const seed = (over: Partial<PersistedQuery> = {}) =>
  withStore((s) =>
    s.put({ hash: HASH, key: LISTED, data: "stored", userId: "u1", buildId: BUILD, savedAt: NOW - HOUR, ...over }),
  );
/** Lets fire-and-forget writes and the 0ms refresh timer settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

describe("createQueryPersistence", () => {
  let userId: string | null;
  let errors: unknown[];
  let nowMs: number;

  function session(over: { listed?: (key: readonly unknown[]) => PersistClass | null } = {}) {
    const persistence: QueryPersistence = createQueryPersistence({
      buildId: BUILD,
      getUserId: () => userId,
      shouldPersist:
        over.listed ?? ((key) => (key[0] === "library-monsters" ? "static" : key[0] === "quests" ? "live" : null)),
      onError: (e) => errors.push(e),
      now: () => nowMs,
    });
    const client = new QueryClient({ defaultOptions: { queries: { persister: persistence.persister, retry: false } } });
    return { persistence, client };
  }

  beforeEach(async () => {
    userId = "u1";
    errors = [];
    nowMs = NOW;
    vi.unstubAllGlobals();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("grimoire-query-cache");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  });

  it("never touches storage for a key off the allow-list", async () => {
    const { client } = session();
    const queryFn = vi.fn(() => Promise.resolve("net"));
    await client.fetchQuery({ queryKey: ["campaigns"], queryFn, staleTime: 0 });
    await client.fetchQuery({ queryKey: ["campaigns"], queryFn, staleTime: 0 });
    expect(queryFn).toHaveBeenCalledTimes(2);
    await settle();
    expect(await readRecord(JSON.stringify(["campaigns"]))).toBeUndefined();
  });

  it("does not store an empty list", async () => {
    const { client } = session();
    await client.fetchQuery({ queryKey: LISTED, queryFn: () => Promise.resolve([]) });
    await settle();
    expect(await readRecord()).toBeUndefined();
    expect(errors).toEqual([]);
  });

  it("runs the queryFn and writes nothing when signed out", async () => {
    userId = null;
    const { client } = session();
    const queryFn = vi.fn(() => Promise.resolve("net"));
    await expect(client.fetchQuery({ queryKey: [...LISTED], queryFn })).resolves.toBe("net");
    await settle();
    expect(await readRecord()).toBeUndefined();
  });

  it("writes the record after the first fetch of a listed key", async () => {
    const { client } = session();
    const queryFn = vi.fn(() => Promise.resolve("net"));
    await client.fetchQuery({ queryKey: [...LISTED], queryFn });
    await settle();
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(await readRecord()).toMatchObject({ data: "net", userId: "u1", buildId: BUILD, savedAt: NOW });
  });

  it("a new page session resolves from disk without calling the queryFn", async () => {
    await seed();
    const { client } = session();
    const queryFn = vi.fn(() => Promise.resolve("net"));
    await expect(client.fetchQuery({ queryKey: [...LISTED], queryFn })).resolves.toBe("stored");
    await settle();
    expect(queryFn).not.toHaveBeenCalled();
  });

  it("serves the disk copy again after the query was garbage-collected", async () => {
    await seed();
    const { client } = session();
    const queryFn = vi.fn(() => Promise.resolve("net"));
    await client.fetchQuery({ queryKey: [...LISTED], queryFn });
    client.getQueryCache().clear();
    await expect(client.fetchQuery({ queryKey: [...LISTED], queryFn })).resolves.toBe("stored");
    expect(queryFn).not.toHaveBeenCalled();
  });

  it("a record of another user is a miss and is replaced under the new user", async () => {
    await seed({ userId: "other" });
    const { client } = session();
    const queryFn = vi.fn(() => Promise.resolve("net"));
    await expect(client.fetchQuery({ queryKey: [...LISTED], queryFn })).resolves.toBe("net");
    await settle();
    expect(await readRecord()).toMatchObject({ data: "net", userId: "u1" });
  });

  it.each([
    ["another build", { buildId: "build-0" }],
    ["older than 24 hours", { savedAt: NOW - 25 * HOUR }],
  ])("a record from %s is returned, then refetched once in the background", async (_name, over) => {
    await seed(over);
    const { client } = session();
    const queryFn = vi.fn(() => Promise.resolve("net"));
    // The background refresh refetches active queries, so a page needs an observer on it.
    const observer = new QueryObserver(client, { queryKey: [...LISTED], queryFn, staleTime: Infinity });
    const seen: unknown[] = [];
    const unsubscribe = observer.subscribe((result) => {
      if (result.data !== undefined && seen.at(-1) !== result.data) seen.push(result.data);
    });
    await vi.waitFor(() => expect(seen).toEqual(["stored", "net"]));
    expect(queryFn).toHaveBeenCalledTimes(1);
    await settle();
    expect(await readRecord()).toMatchObject({ data: "net", buildId: BUILD, savedAt: NOW });
    unsubscribe();
  });

  it("a record older than 7 days is a miss", async () => {
    await seed({ savedAt: NOW - 8 * 24 * HOUR });
    const { client } = session();
    const queryFn = vi.fn(() => Promise.resolve("net"));
    await expect(client.fetchQuery({ queryKey: [...LISTED], queryFn })).resolves.toBe("net");
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("a refetch with data present always calls the queryFn", async () => {
    await seed();
    const { client } = session();
    const queryFn = vi.fn(() => Promise.resolve("net"));
    await client.fetchQuery({ queryKey: [...LISTED], queryFn });
    expect(queryFn).not.toHaveBeenCalled();
    await client.refetchQueries({ queryKey: [...LISTED] });
    expect(queryFn).toHaveBeenCalledTimes(1);
    await settle();
    expect(await readRecord()).toMatchObject({ data: "net" });
  });

  it("does not write ephemeral data", async () => {
    const { client } = session();
    const queryFn = vi.fn(() => Promise.resolve({ url: "blob:https://app.invalid/abc" }));
    await client.fetchQuery({ queryKey: [...LISTED], queryFn });
    await settle();
    expect(await readRecord()).toBeUndefined();
  });

  it("writes nothing when the user changed while the fetch was in flight", async () => {
    const { client } = session();
    const queryFn = vi.fn(async () => {
      userId = "u2";
      return "net";
    });
    await expect(client.fetchQuery({ queryKey: [...LISTED], queryFn })).resolves.toBe("net");
    await settle();
    expect(await readRecord()).toBeUndefined();
  });

  it("runs the queryFn without throwing when indexedDB is missing", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const { client } = session();
    const queryFn = vi.fn(() => Promise.resolve("net"));
    await expect(client.fetchQuery({ queryKey: [...LISTED], queryFn })).resolves.toBe("net");
    await client.refetchQueries({ queryKey: [...LISTED] });
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(errors).toEqual([]);
  });

  it("treats a storage read that throws as a miss and reports it", async () => {
    const boom = new Error("read failed");
    vi.spyOn(IDBObjectStore.prototype, "get").mockImplementationOnce(() => {
      throw boom;
    });
    const { client } = session();
    const queryFn = vi.fn(() => Promise.resolve("net"));
    await expect(client.fetchQuery({ queryKey: [...LISTED], queryFn })).resolves.toBe("net");
    expect(errors).toContain(boom);
    vi.restoreAllMocks();
  });

  it("reports a failed write and still returns the data", async () => {
    const { client } = session();
    const queryFn = vi.fn(() => Promise.resolve({ s: Symbol("unclonable") }));
    await expect(client.fetchQuery({ queryKey: [...LISTED], queryFn })).resolves.toBeDefined();
    await settle();
    expect(errors).toHaveLength(1);
  });

  it("prune deletes other users' records and expired ones, keeping the rest", async () => {
    const { persistence } = session();
    const put = (hash: string, over: Partial<PersistedQuery>) =>
      withStore((s) => s.put({ hash, key: [hash], data: 1, userId: "u1", buildId: BUILD, savedAt: NOW - HOUR, ...over }));
    await put("keep", {});
    await put("other", { userId: "u2" });
    await put("expired", { savedAt: NOW - 8 * 24 * HOUR });
    await persistence.prune("u1");
    expect(await readRecord("keep")).toBeDefined();
    expect(await readRecord("other")).toBeUndefined();
    expect(await readRecord("expired")).toBeUndefined();
  });

  it("clear empties the store", async () => {
    await seed();
    const { persistence } = session();
    await persistence.clear();
    expect(await readRecord()).toBeUndefined();
  });

  it("prune and clear never reject without indexedDB", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const { persistence } = session();
    await expect(persistence.prune("u1")).resolves.toBeUndefined();
    await expect(persistence.clear()).resolves.toBeUndefined();
  });

  describe("live class (#999)", () => {
    const seedLive = (over: Partial<PersistedQuery> = {}) =>
      withStore((st) =>
        st.put({ hash: LIVE_HASH, key: LIVE, data: "stored", userId: "u1", buildId: BUILD, savedAt: NOW - 1000, ...over }),
      );

    it("returns a fresh same-build hit at once, then always revalidates it", async () => {
      await seedLive();
      const { client } = session();
      const queryFn = vi.fn(() => Promise.resolve("net"));
      // staleTime Infinity is what the live roots get in main.ts: only the invalidation corrects the disk copy.
      const observer = new QueryObserver(client, { queryKey: [...LIVE], queryFn, staleTime: Infinity });
      const seen: unknown[] = [];
      const unsubscribe = observer.subscribe((result) => {
        if (result.data !== undefined && seen.at(-1) !== result.data) seen.push(result.data);
      });
      await vi.waitFor(() => expect(seen).toEqual(["stored", "net"]));
      expect(queryFn).toHaveBeenCalledTimes(1);
      await settle();
      expect(await readRecord(LIVE_HASH)).toMatchObject({ data: "net", savedAt: NOW });
      unsubscribe();
    });

    it("a miss goes to the network and is written", async () => {
      const { client } = session();
      const queryFn = vi.fn(() => Promise.resolve("net"));
      await expect(client.fetchQuery({ queryKey: [...LIVE], queryFn })).resolves.toBe("net");
      await settle();
      expect(queryFn).toHaveBeenCalledTimes(1);
      expect(await readRecord(LIVE_HASH)).toMatchObject({ data: "net", userId: "u1" });
    });

    it("never serves another user's record", async () => {
      await seedLive({ userId: "other" });
      const { client } = session();
      const queryFn = vi.fn(() => Promise.resolve("net"));
      await expect(client.fetchQuery({ queryKey: [...LIVE], queryFn })).resolves.toBe("net");
      expect(queryFn).toHaveBeenCalledTimes(1);
    });

    it("a record older than 7 days is a miss", async () => {
      await seedLive({ savedAt: NOW - 8 * 24 * HOUR });
      const { client } = session();
      const queryFn = vi.fn(() => Promise.resolve("net"));
      await expect(client.fetchQuery({ queryKey: [...LIVE], queryFn })).resolves.toBe("net");
      expect(queryFn).toHaveBeenCalledTimes(1);
    });

    it("a static hit of the same age is not revalidated", async () => {
      await seed({ savedAt: NOW - 1000 });
      const { client } = session();
      const queryFn = vi.fn(() => Promise.resolve("net"));
      const observer = new QueryObserver(client, { queryKey: [...LISTED], queryFn, staleTime: Infinity });
      const unsubscribe = observer.subscribe(() => undefined);
      await vi.waitFor(() => expect(observer.getCurrentResult().data).toBe("stored"));
      await settle();
      expect(queryFn).not.toHaveBeenCalled();
      unsubscribe();
    });
  });
});
