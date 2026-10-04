import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { useLocationTextSearch } from "./useLocationTextSearch";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "campaign-1" }) }));

function setup(query: string) {
  const text = ref(query);
  let matchedIds!: ReturnType<typeof useLocationTextSearch>["matchedIds"];
  let matchedTerm!: ReturnType<typeof useLocationTextSearch>["matchedTerm"];
  const wrapper = mount(
    defineComponent({
      setup() {
        ({ matchedIds, matchedTerm } = useLocationTextSearch(text));
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
  );
  return { text, wrapper, matchedIds: () => matchedIds.value, matchedTerm: () => matchedTerm.value };
}

describe("useLocationTextSearch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.rpc.mockReset();
  });

  it("sends nothing for a query shorter than two characters", async () => {
    const { matchedIds } = setup("a");
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(matchedIds().size).toBe(0);
  });

  it("waits for typing to pause, then returns the matching ids", async () => {
    mocks.rpc.mockResolvedValue({ data: ["a", "b"], error: null });
    const { text, matchedIds } = setup("");
    text.value = " dragon ";
    await nextTick();
    await vi.advanceTimersByTimeAsync(100);
    expect(mocks.rpc).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(mocks.rpc).toHaveBeenCalledWith("search_campaign_location_text", {
      p_campaign_id: "campaign-1",
      p_query: "dragon",
    });
    expect([...matchedIds()]).toEqual(["a", "b"]);
  });

  it("keeps the previous ids, and the term they answer, while the next term loads", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: ["a"], error: null });
    const { text, matchedIds, matchedTerm } = setup("dragon");
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(matchedTerm()).toBe("dragon");

    let release!: (v: { data: string[]; error: null }) => void;
    mocks.rpc.mockReturnValueOnce(new Promise((r) => { release = r; }));
    text.value = "dragons";
    await nextTick();
    await vi.advanceTimersByTimeAsync(300);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect([...matchedIds()]).toEqual(["a"]);
    expect(matchedTerm()).toBe("dragon");

    release({ data: ["b"], error: null });
    await flushPromises();
    expect([...matchedIds()]).toEqual(["b"]);
    expect(matchedTerm()).toBe("dragons");
  });

  it("has no term and no ids below the minimum length", async () => {
    const { matchedTerm } = setup("a");
    await vi.advanceTimersByTimeAsync(400);
    expect(matchedTerm()).toBeNull();
  });
});
