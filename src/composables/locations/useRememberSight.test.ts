import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, ref } from "vue";

const store = vi.hoisted(() => ({ campaign: { map_memory: "remembered" } as { map_memory: string } | null }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ get activeCampaign() { return store.campaign; } }) }));
const toastSpy = vi.hoisted(() => ({ error: vi.fn(), fromError: (e: unknown) => (e instanceof Error ? e.message : "x") }));
vi.mock("@/composables/useToast", () => ({ useToast: () => toastSpy }));

import { useRememberSight } from "./useRememberSight";

function setup(over: { enabled?: boolean; loading?: boolean; seen?: string[]; remember?: (c: string[]) => Promise<void> } = {}) {
  const stored = ref(new Set<string>());
  const sight = ref(new Set(over.seen ?? ["1,1", "2,1"]));
  const enabled = ref(over.enabled ?? true);
  const loading = ref(over.loading ?? false);
  const remember = vi.fn(
    over.remember ??
      (async (cells: string[]) => {
        stored.value = new Set([...stored.value, ...cells]);
      }),
  );
  const scope = effectScope();
  scope.run(() =>
    useRememberSight({
      memory: { memory: computed(() => stored.value), isLoading: loading, remember } as never,
      sight: computed(() => sight.value),
      enabled,
    }),
  );
  return { remember, sight, enabled, loading, stored, scope };
}
const settle = async () => {
  await vi.advanceTimersByTimeAsync(400);
};

beforeEach(() => {
  vi.useFakeTimers();
  store.campaign = { map_memory: "remembered" };
  toastSpy.error.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("useRememberSight", () => {
  it("writes the newly seen squares once after the sight settles", async () => {
    const { remember, sight } = setup({ seen: ["1,1"] });
    sight.value = new Set(["1,1", "2,1"]);
    sight.value = new Set(["1,1", "2,1", "3,1"]);
    await settle();
    expect(remember).toHaveBeenCalledTimes(1);
    expect(remember).toHaveBeenCalledWith(["1,1", "2,1", "3,1"]);
  });

  it("writes nothing in strict mode", async () => {
    store.campaign = { map_memory: "strict" };
    const { remember } = setup();
    await settle();
    expect(remember).not.toHaveBeenCalled();
  });

  it("writes nothing while disabled, then writes once enabled", async () => {
    const { remember, enabled } = setup({ enabled: false });
    await settle();
    expect(remember).not.toHaveBeenCalled();
    enabled.value = true;
    await settle();
    expect(remember).toHaveBeenCalledTimes(1);
  });

  it("writes nothing before the memory has loaded", async () => {
    const { remember, loading } = setup({ loading: true });
    await settle();
    expect(remember).not.toHaveBeenCalled();
    loading.value = false;
    await settle();
    expect(remember).toHaveBeenCalledTimes(1);
  });

  it("writes nothing when everything seen is already remembered", async () => {
    const { remember, stored } = setup();
    await settle();
    remember.mockClear();
    expect(stored.value.size).toBe(2);
    await settle();
    expect(remember).not.toHaveBeenCalled();
  });

  it("keeps at most one write in flight and sends the squares seen meanwhile afterwards", async () => {
    let release!: () => void;
    let first = true;
    const stored = { cells: new Set<string>() };
    const ctx = setup({
      remember: async (cells) => {
        if (first) {
          first = false;
          await new Promise<void>((r) => (release = r));
        }
        cells.forEach((c) => stored.cells.add(c));
      },
    });
    await settle();
    ctx.sight.value = new Set(["1,1", "2,1", "9,9"]);
    await settle();
    expect(ctx.remember).toHaveBeenCalledTimes(1);
    release();
    await settle();
    expect(ctx.remember).toHaveBeenCalledTimes(2);
  });

  it("reports a failed write once and does not retry the same squares", async () => {
    const { remember } = setup({ remember: async () => { throw new Error("not the DM"); } });
    await settle();
    await settle();
    expect(remember).toHaveBeenCalledTimes(1);
    expect(toastSpy.error).toHaveBeenCalledTimes(1);
    expect(toastSpy.error).toHaveBeenCalledWith("not the DM");
  });
});
