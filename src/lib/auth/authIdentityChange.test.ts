import { describe, expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/vue-query";
import { createIdentityChangeGate, resetForNewIdentity } from "./authIdentityChange";

describe("createIdentityChangeGate", () => {
  it("reports the first signed-in identity — the cache before it belonged to nobody", () => {
    const changed = createIdentityChangeGate();
    expect(changed("dm-1")).toBe(true);
  });

  it("does not report the page's first INITIAL_SESSION: a cold load has no cache of another identity", () => {
    const changed = createIdentityChangeGate();
    expect(changed("dm-1", "INITIAL_SESSION")).toBe(false);
    // The same session re-announced stays quiet, a different account does not.
    expect(changed("dm-1", "SIGNED_IN")).toBe(false);
    expect(changed("dm-2", "SIGNED_IN")).toBe(true);
  });

  it("still reports a first sighting that arrives as SIGNED_IN", () => {
    const changed = createIdentityChangeGate();
    expect(changed("dm-1", "SIGNED_IN")).toBe(true);
  });

  it("reports a sign-in after a signed-out INITIAL_SESSION", () => {
    const changed = createIdentityChangeGate();
    expect(changed(null, "INITIAL_SESSION")).toBe(false);
    expect(changed("dm-1", "SIGNED_IN")).toBe(true);
  });

  it("stays quiet while auth-js re-announces the same session", () => {
    const changed = createIdentityChangeGate();
    changed("dm-1");
    // SIGNED_IN fires again on tab focus and on a restored session; the whole
    // app refetching each time would be a storm for nothing.
    expect(changed("dm-1")).toBe(false);
    expect(changed("dm-1")).toBe(false);
  });

  it("reports a different account, so one DM never reads the other's cache", () => {
    const changed = createIdentityChangeGate();
    changed("dm-1");
    expect(changed("dm-2")).toBe(true);
  });

  it("says nothing on sign-out, and reports the sign-in that follows", () => {
    const changed = createIdentityChangeGate();
    changed("dm-1");
    // Signing out heads for /login; the cache is about to belong to nobody.
    expect(changed(null)).toBe(false);
    // This is the reported bug: back in as the same DM, over a cache filled
    // while signed out (an RLS-empty `200 []` under an identical query key).
    expect(changed("dm-1")).toBe(true);
  });

  it("does not report a signed-out app staying signed out", () => {
    const changed = createIdentityChangeGate();
    expect(changed(null)).toBe(false);
    expect(changed(null)).toBe(false);
  });
});

describe("resetForNewIdentity", () => {
  // A key that names no user but whose answer depends on the caller: the
  // library art entries merge the caller's own overrides over canonical art.
  const ART = ["library-monster-art", "entries", ["srd_owlbear"]];
  const SHARED = ["library-species"];
  const isShared = (key: readonly unknown[]) => key[0] === SHARED[0];

  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  /** A mounted view over ART, holding account A's override. */
  function mountedAs(queryFn: () => Promise<string>) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    client.setQueryData(ART, "a-private-art");
    const observer = new QueryObserver<string>(client, { queryKey: ART, queryFn });
    const seen: (string | undefined)[] = [];
    const unsubscribe = observer.subscribe((result) => seen.push(result.data));
    return { client, observer, seen, unsubscribe };
  }

  it("takes the previous account's data off screen before a slow refetch answers", async () => {
    const response = deferred<string>();
    const { client, observer, unsubscribe } = mountedAs(() => response.promise);
    expect(observer.getCurrentResult().data).toBe("a-private-art");

    const done = resetForNewIdentity(client, isShared);
    // Let the cancel settle and the reset run; the refetch is still out.
    await flush();
    expect(observer.getCurrentResult().data).toBeUndefined();
    expect(observer.getCurrentResult().isPending).toBe(true);

    response.resolve("b-art");
    await done;
    expect(observer.getCurrentResult().data).toBe("b-art");
    unsubscribe();
  });

  it("never falls back to the previous account's data when the refetch fails", async () => {
    const { client, observer, seen, unsubscribe } = mountedAs(() => Promise.reject(new Error("offline")));

    await resetForNewIdentity(client, isShared);
    const result = observer.getCurrentResult();
    expect(result.isError).toBe(true);
    expect(result.data).toBeUndefined();
    // Nothing the observer was told after the reset carried A's row.
    expect(seen.at(-1)).toBeUndefined();
    unsubscribe();
  });

  it("empties entries no view is showing, so the next mount asks afresh", async () => {
    const client = new QueryClient();
    client.setQueryData(ART, "a-private-art");

    await resetForNewIdentity(client, isShared);
    expect(client.getQueryData(ART)).toBeUndefined();
  });

  it("drops a read still in flight for the previous identity rather than letting it land", async () => {
    const stale = deferred<string>();
    const fresh = deferred<string>();
    let calls = 0;
    const { client, observer, unsubscribe } = mountedAs(() => (++calls === 1 ? stale.promise : fresh.promise));
    void observer.refetch();
    await flush();

    const done = resetForNewIdentity(client, isShared);
    stale.resolve("a-late-answer");
    fresh.resolve("b-art");
    await done;
    expect(observer.getCurrentResult().data).toBe("b-art");
    unsubscribe();
  });

  it("keeps shared library content on screen while it refetches, since it is the same for everyone", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
    client.setQueryData(SHARED, ["elf"]);
    const response = deferred<string[]>();
    const observer = new QueryObserver<string[]>(client, { queryKey: SHARED, queryFn: () => response.promise });
    const unsubscribe = observer.subscribe(() => {});

    const done = resetForNewIdentity(client, isShared);
    await flush();
    expect(observer.getCurrentResult().data).toEqual(["elf"]);

    response.resolve(["elf", "dwarf"]);
    await done;
    expect(observer.getCurrentResult().data).toEqual(["elf", "dwarf"]);
    unsubscribe();
  });
});
