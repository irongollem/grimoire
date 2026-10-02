import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { openQueryStore } from "./store";
import type { PersistedQuery } from "./store";

function rec(hash: string, over: Partial<PersistedQuery> = {}): PersistedQuery {
  return { hash, key: [hash], data: { v: 1 }, userId: "u", buildId: "b", savedAt: 100, ...over };
}

describe("queryStore", () => {
  beforeEach(async () => {
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase("grimoire-query-cache");
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    });
  });

  it("round-trips a record by hash, upserting on the same hash", async () => {
    const store = await openQueryStore();
    await store.put(rec("a"));
    await store.put(rec("b", { data: new Map([[1, new Date(0)]]) }));
    await store.put(rec("a", { data: { v: 2 } }));
    expect((await store.get("a"))?.data).toEqual({ v: 2 });
    expect((await store.get("b"))?.data).toBeInstanceOf(Map);
    expect(await store.get("missing")).toBeUndefined();
    store.close();
  });

  it("rejects an unclonable record and leaves the store usable", async () => {
    const store = await openQueryStore();
    await expect(store.put(rec("bad", { data: { s: Symbol("x") } }))).rejects.toBeTruthy();
    await store.put(rec("good"));
    expect(await store.get("bad")).toBeUndefined();
    expect(await store.get("good")).toBeDefined();
    store.close();
  });

  it("clears everything", async () => {
    const store = await openQueryStore();
    await store.put(rec("a"));
    await store.put(rec("b"));
    await store.clear();
    expect(await store.get("a")).toBeUndefined();
    expect(await store.get("b")).toBeUndefined();
    store.close();
  });

  it("prunes other users' records and records saved before the cutoff, keeping the rest", async () => {
    const store = await openQueryStore();
    await store.put(rec("mine-fresh", { userId: "u", savedAt: 500 }));
    await store.put(rec("mine-old", { userId: "u", savedAt: 50 }));
    await store.put(rec("before-user", { userId: "a", savedAt: 500 }));
    await store.put(rec("after-user", { userId: "z", savedAt: 500 }));
    await store.prune("u", 100);
    expect(await store.get("mine-fresh")).toBeDefined();
    expect(await store.get("mine-old")).toBeUndefined();
    expect(await store.get("before-user")).toBeUndefined();
    expect(await store.get("after-user")).toBeUndefined();
    store.close();
  });
});
