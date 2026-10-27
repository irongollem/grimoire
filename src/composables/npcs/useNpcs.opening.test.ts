import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { describe, expect, it, vi } from "vitest";
import { defineComponent, ref, type Ref } from "vue";
import type { NpcListRow } from "@/types/npc.types";

const mocks = vi.hoisted(() => ({ resolve: null as null | ((v: unknown) => void), updates: 0 }));

vi.mock("@/lib/supabase", () => ({
  getCurrentUser: () => null,
  supabase: {
    from: () => ({
      update: () => { mocks.updates += 1; return { eq: () => Promise.resolve({ error: null }) }; },
      select: () => ({
        eq: () => ({
          single: () => new Promise((resolve) => { mocks.resolve = resolve; }),
        }),
      }),
    }),
  },
}));

import { useCampaignStore } from "@/stores/campaign";
import { npcListQuery, useNpcOpening } from "./useNpcs";

describe("useNpcOpening", () => {
  it("previews from the list row, keeps the record undefined until the read lands, then swaps (#999)", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useCampaignStore().activeCampaignId = "c1";
    const queryClient = new QueryClient();
    const row = { id: "n1", name: "Maera" } as NpcListRow;
    queryClient.setQueryData(npcListQuery("c1").queryKey, [row]);

    let opening!: ReturnType<typeof useNpcOpening>;
    mount(
      defineComponent({
        setup() {
          opening = useNpcOpening(ref("n1"));
          return () => null;
        },
      }),
      { global: { plugins: [pinia, [VueQueryPlugin, { queryClient }]] } },
    );
    await flushPromises();

    expect(opening.preview.value).toEqual(row);
    expect(opening.npc.value).toBeUndefined();
    expect(opening.isLoading.value).toBe(false);
    // The save-safety contract: while only the list row is known, the one value an
    // editor takes (`npc`) is undefined and nothing has been written (#999).
    expect(mocks.updates).toBe(0);

    const fullRow = { ...row, backstory: "Born in Mirabar." };
    mocks.resolve?.({ data: fullRow, error: null });
    await flushPromises();

    expect(opening.npc.value).toEqual(fullRow);
    expect(opening.preview.value).toEqual(fullRow);
  });

  it("reports loading when neither the list nor the record is known", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useCampaignStore().activeCampaignId = "c1";
    let opening!: ReturnType<typeof useNpcOpening>;
    mount(
      defineComponent({
        setup() {
          opening = useNpcOpening(ref("n2"));
          return () => null;
        },
      }),
      { global: { plugins: [pinia, [VueQueryPlugin, { queryClient: new QueryClient() }]] } },
    );
    await flushPromises();
    expect(opening.preview.value).toBeUndefined();
    expect(opening.isLoading.value).toBe(true);
  });

  function open(id: ReturnType<typeof ref<string>>, rows: NpcListRow[]) {
    const pinia = createPinia();
    setActivePinia(pinia);
    useCampaignStore().activeCampaignId = "c1";
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(npcListQuery("c1").queryKey, rows);
    let opening!: ReturnType<typeof useNpcOpening>;
    mount(
      defineComponent({
        setup() {
          opening = useNpcOpening(id as Ref<string>);
          return () => null;
        },
      }),
      { global: { plugins: [pinia, [VueQueryPlugin, { queryClient }]] } },
    );
    return opening;
  }

  it("reports a failed read as failed while the list row keeps painting, and not before it settles", async () => {
    const opening = open(ref("n1"), [{ id: "n1", name: "Maera" } as NpcListRow]);
    await flushPromises();
    expect(opening.failed.value).toBe(false);
    mocks.resolve?.({ data: null, error: new Error("denied") });
    await flushPromises();
    expect(opening.failed.value).toBe(true);
    expect(opening.preview.value?.name).toBe("Maera");
  });

  it("previews from the new NPC's list row when the id changes", async () => {
    const id = ref("n1");
    const opening = open(id, [{ id: "n1", name: "Maera" } as NpcListRow, { id: "n3", name: "Tolin" } as NpcListRow]);
    await flushPromises();
    expect(opening.preview.value?.name).toBe("Maera");
    id.value = "n3";
    await flushPromises();
    expect(opening.preview.value?.name).toBe("Tolin");
  });
});
