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
  const wrapper = mount(
    defineComponent({
      setup() {
        ({ matchedIds } = useLocationTextSearch(text));
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
  );
  return { text, wrapper, matchedIds: () => matchedIds.value };
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
});
