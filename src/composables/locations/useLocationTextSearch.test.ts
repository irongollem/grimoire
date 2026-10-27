import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { useLocationTextSearch } from "./useLocationTextSearch";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
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
    fake.reset();
  });

  /** The database's answer: places of campaign-1 whose text holds the term. */
  function servePlaces(places: Record<string, string>) {
    fake.onRpc("search_campaign_location_text", (args) =>
      args.p_campaign_id === "campaign-1"
        ? Object.entries(places).filter(([, text]) => text.includes(String(args.p_query))).map(([id]) => id)
        : [],
    );
  }

  it("sends nothing for a query shorter than two characters, and has no term or ids", async () => {
    const { matchedIds, matchedTerm } = setup("a");
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
    expect(fake.calls).toEqual([]);
    expect(matchedIds().size).toBe(0);
    expect(matchedTerm()).toBeNull();
  });

  it("waits for typing to pause, then returns the matching ids", async () => {
    servePlaces({ a: "a dragon lair", b: "dragon bones", c: "a quiet inn" });
    const { text, matchedIds } = setup("");
    text.value = " dragon ";
    await nextTick();
    await vi.advanceTimersByTimeAsync(100);
    expect(fake.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    // The padded term went out trimmed: " dragon " would match none of the text.
    expect([...matchedIds()]).toEqual(["a", "b"]);
  });

  it("keeps the previous ids, and the term they answer, while the next term loads", async () => {
    servePlaces({ a: "a dragon lair" });
    const { text, matchedIds, matchedTerm } = setup("dragon");
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(matchedTerm()).toBe("dragon");

    let release!: () => void;
    const held = new Promise<void>((r) => { release = r; });
    fake.onRpc("search_campaign_location_text", async (args) => {
      await held;
      return String(args.p_query) === "dragons" ? ["b"] : [];
    });
    text.value = "dragons";
    await nextTick();
    await vi.advanceTimersByTimeAsync(300);
    expect([...matchedIds()]).toEqual(["a"]);
    expect(matchedTerm()).toBe("dragon");

    release();
    await flushPromises();
    expect([...matchedIds()]).toEqual(["b"]);
    expect(matchedTerm()).toBe("dragons");
  });
});
