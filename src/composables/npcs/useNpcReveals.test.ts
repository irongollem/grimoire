import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

const mocks = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from } }));

import { useNpcReveals } from "./useNpcReveals";

function run() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let query!: ReturnType<typeof useNpcReveals>;
  const Host = defineComponent({
    setup() {
      query = useNpcReveals("npc-1");
      return () => null;
    },
  });
  mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } });
  return { client, query: () => query };
}

describe("useNpcReveals", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
  });

  it("reads one NPC's reveals and keys them by party member", async () => {
    mocks.eq.mockResolvedValue({
      data: [{ party_member_id: "pm-1", revealed_at: "2026-10-04T10:00:00Z" }],
      error: null,
    });
    const { client, query } = run();
    await flushPromises();
    expect(mocks.from).toHaveBeenCalledWith("npc_reveals");
    expect(mocks.select).toHaveBeenCalledWith("party_member_id,revealed_at");
    expect(mocks.eq).toHaveBeenCalledWith("npc_id", "npc-1");
    expect(query().data.value).toEqual(new Map([["pm-1", "2026-10-04T10:00:00Z"]]));
    expect(client.getQueryCache().find({ queryKey: ["npc-reveals", "npc-1"] })).toBeDefined();
  });

  it("throws the read error instead of reporting no reveals", async () => {
    mocks.eq.mockResolvedValue({ data: null, error: new Error("denied") });
    const { query } = run();
    await flushPromises();
    expect(query().isError.value).toBe(true);
    expect(query().error.value?.message).toBe("denied");
  });
});
