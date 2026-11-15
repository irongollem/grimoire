import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { useCampaignStore } from "@/stores/campaign";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke } }, getCurrentUser: () => null }));

import { PAUSE_MS, useManualSuggestions } from "./useManualSuggestions";

const pages = [{ id: "a", title: "A" }, { id: "b", title: "B", summary: "about b" }];

function setup(opts: { aiEnabled?: boolean; hasResults?: boolean } = {}) {
  setActivePinia(createPinia());
  const store = useCampaignStore();
  store.activeCampaignId = "c1";
  store.activeCampaign = { id: "c1", ai_enabled: opts.aiEnabled ?? true } as never;
  const query = ref("");
  const hasResults = ref(opts.hasResults ?? false);
  let out!: ReturnType<typeof useManualSuggestions>;
  mount(
    defineComponent({ setup() { out = useManualSuggestions(query, pages, hasResults); return () => null; } }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
  );
  return { query, hasResults, out };
}

async function settle() {
  await vi.advanceTimersByTimeAsync(PAUSE_MS + 1);
  await flushPromises();
}

describe("useManualSuggestions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { suggestions: [{ id: "b", probability: 0.7 }], judged: true }, error: null });
  });
  afterEach(() => vi.useRealTimers());

  it("asks for a question of 8 characters and shows the suggested ids", async () => {
    const { query, out } = setup();
    query.value = "hide an npc";
    await settle();
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0][1].body).toEqual({ campaignId: "c1", query: "hide an npc", pages });
    expect(out.suggestedIds.value).toEqual(["b"]);
  });

  it("sends nothing for a query under 8 characters", async () => {
    const { query, out } = setup();
    query.value = "  hide  ";
    await settle();
    expect(invoke).not.toHaveBeenCalled();
    expect(out.isWaiting.value).toBe(false);
  });

  it("sends nothing while the substring search has results", async () => {
    const { query } = setup({ hasResults: true });
    query.value = "hide an npc";
    await settle();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("sends nothing with the campaign's AI off (nothing typed goes to a model)", async () => {
    const { query, out } = setup({ aiEnabled: false });
    query.value = "hide an npc";
    await settle();
    expect(invoke).not.toHaveBeenCalled();
    expect(out.isWaiting.value).toBe(false);
  });

  it("waits for typing to pause before asking", async () => {
    const { query, out } = setup();
    query.value = "hide an npc";
    await vi.advanceTimersByTimeAsync(PAUSE_MS - 100);
    expect(invoke).not.toHaveBeenCalled();
    expect(out.isWaiting.value).toBe(true);
    query.value = "hide an npc from players";
    await vi.advanceTimersByTimeAsync(PAUSE_MS - 100);
    expect(invoke).not.toHaveBeenCalled();
    await settle();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("does not show an older query's answer after the query changes", async () => {
    let release!: (v: unknown) => void;
    invoke.mockReturnValueOnce(new Promise((r) => { release = r; }));
    const { query, out } = setup();
    query.value = "first question here";
    await vi.advanceTimersByTimeAsync(PAUSE_MS + 1);
    query.value = "second question here";
    release({ data: { suggestions: [{ id: "a", probability: 0.9 }], judged: true }, error: null });
    await flushPromises();
    expect(out.suggestedIds.value).toEqual([]);
    await settle();
    expect(out.suggestedIds.value).toEqual(["b"]);
  });

  it("shows nothing when the function fails", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("boom") });
    const { query, out } = setup();
    query.value = "hide an npc";
    await settle();
    expect(out.suggestedIds.value).toEqual([]);
    expect(out.isWaiting.value).toBe(false);
  });
});
