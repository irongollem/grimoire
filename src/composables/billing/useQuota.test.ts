import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, type App } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { QuotaResource, QuotaResult } from "@/types/subscription.types";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  auth: { isAuthenticated: true, isAppAdmin: false },
}));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));

import { isOverQuota, useInvalidateQuota, useQuota } from "./useQuota";

const result = (current: number, limit: number): QuotaResult => ({
  allowed: current < limit,
  current,
  limit,
  unlimited: false,
});

const ALL = {
  npcs: result(3, 5),
  monsters: result(1, 1),
};

let client: QueryClient;
let apps: App[] = [];

/** Runs `setup` inside a real component so vue-query has its injection context. */
function mount<T>(setup: () => T): T {
  let out!: T;
  const app = createApp(
    defineComponent({
      setup() {
        out = setup();
        return () => h("div");
      },
    }),
  );
  app.use(VueQueryPlugin, { queryClient: client });
  app.mount(document.createElement("div"));
  apps.push(app);
  return out;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("useQuota", () => {
  beforeEach(() => {
    apps.forEach((a) => a.unmount());
    apps = [];
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: ALL, error: null });
    mocks.auth.isAuthenticated = true;
    mocks.auth.isAppAdmin = false;
  });

  it("answers several resources with one rpc call, each from its own entry", async () => {
    const [npcs, monsters] = mount(() => [useQuota("npcs"), useQuota("monsters")]);
    await flush();

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("check_all_quotas");
    expect(npcs!.quota.value).toEqual(ALL.npcs);
    expect(npcs!.remaining.value).toBe(2);
    expect(npcs!.canCreate.value).toBe(true);
    expect(monsters!.quota.value).toEqual(ALL.monsters);
    expect(monsters!.canCreate.value).toBe(false);
  });

  it("allows creation while loading and does not call when signed out", async () => {
    mocks.auth.isAuthenticated = false;
    const q = mount(() => useQuota("npcs"));
    await flush();

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(q.canCreate.value).toBe(true);
    expect(q.quota.value).toBeUndefined();
  });

  it("surfaces a resource missing from the response instead of defaulting it", async () => {
    const q = mount(() => useQuota("quests" as QuotaResource));
    await flush();

    expect(q.quota.value).toBeUndefined();
    // The select threw: no invented answer, and the read-side stays permissive
    // because the server enforces the cap on the write.
    expect(q.canCreate.value).toBe(true);
  });

  it("makes no call for an admin", async () => {
    mocks.auth.isAppAdmin = true;
    const q = mount(() => useQuota("npcs"));
    await flush();

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(q.canCreate.value).toBe(true);
    expect(q.remaining.value).toBeNull();
    expect(q.quota.value?.unlimited).toBe(true);
  });

  it("refetches the shared query when invalidated", async () => {
    const [q, invalidate] = mount(() => [useQuota("npcs"), useInvalidateQuota()] as const);
    await flush();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);

    mocks.rpc.mockResolvedValue({ data: { ...ALL, npcs: result(4, 5) }, error: null });
    await invalidate("npcs");
    await flush();

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(q.quota.value).toEqual(result(4, 5));
  });
});

describe("isOverQuota", () => {
  it("is false until the quota has loaded", () => {
    expect(isOverQuota(undefined)).toBe(false);
  });

  it("is false for an unlimited quota whatever the count", () => {
    expect(isOverQuota({ allowed: true, current: 9, limit: -1, unlimited: true })).toBe(false);
  });

  it("is false at the limit", () => {
    expect(isOverQuota({ allowed: false, current: 1, limit: 1, unlimited: false })).toBe(false);
  });

  it("is true over the limit", () => {
    expect(isOverQuota({ allowed: false, current: 2, limit: 1, unlimited: false })).toBe(true);
  });
});
