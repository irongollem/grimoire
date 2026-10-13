import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  not: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }));

const stores = vi.hoisted(() => ({ campaign: { activeCampaignId: "c-1" as string | null } }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => stores.campaign }));

const data = vi.hoisted(() => ({
  sessions: [] as { id: string; number: number | null }[],
  npcs: [] as { id: string; name: string; disguise_name: string | null; disguise_portrait_url: string | null; is_revealed: boolean }[],
}));
vi.mock("@/composables/sessions/useCampaignSessions", () => ({
  useCampaignSessions: () => ({ data: { value: data.sessions } }),
}));
vi.mock("@/composables/npcs/useNpcs", () => ({ useNpcs: () => ({ data: { value: data.npcs } }) }));

import { useCampaignSecrets, useDisclosedSecrets } from "./useCampaignSecrets";

function run<T>(use: () => T) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let result!: T;
  const Host = defineComponent({
    setup() {
      result = use();
      return () => null;
    },
  });
  mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } });
  return { result: () => result };
}

describe("campaign secrets", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    stores.campaign.activeCampaignId = "c-1";
    data.sessions = [{ id: "s-14", number: 14 }];
    data.npcs = [{ id: "n-1", name: "Bram", disguise_name: null, disguise_portrait_url: null, is_revealed: true }];
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ not: mocks.not });
  });

  it("lists the campaign's secrets through the RPC", async () => {
    const rows = [{ entity_type: "location", entity_id: "l-1", entity_name: "Crypt", field: "description", secret_id: "x", excerpt: "..." }];
    mocks.rpc.mockResolvedValue({ data: rows, error: null });
    const { result } = run(() => useCampaignSecrets());
    await flushPromises();
    expect(mocks.rpc).toHaveBeenCalledWith("list_campaign_secrets", { p_campaign_id: "c-1" });
    expect(result().data.value).toEqual(rows);
  });

  it("does not fetch when disabled", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    run(() => useCampaignSecrets(ref(false)));
    await flushPromises();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("surfaces the RPC error", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("Not authorized") });
    const { result } = run(() => useCampaignSecrets());
    await flushPromises();
    expect(result().error.value?.message).toBe("Not authorized");
  });

  it("labels each disclosed secret by its earliest memory, scoped to the campaign", async () => {
    mocks.not.mockResolvedValue({
      data: [
        { secret_id: "x", npc_id: "n-1", session_id: "s-14", created_at: "2026-01-02" },
        { secret_id: "y", npc_id: "n-1", session_id: null, created_at: "2026-01-03" },
      ],
      error: null,
    });
    const { result } = run(() => useDisclosedSecrets());
    await flushPromises();
    expect(mocks.eq).toHaveBeenCalledWith("campaign_id", "c-1");
    expect(mocks.not).toHaveBeenCalledWith("secret_id", "is", null);
    expect(result().labels.value.get("x")).toBe("known since Session 14 (Bram)");
    expect(result().labels.value.get("y")).toBe("known to the party (Bram)");
  });

  it("does not read memories when disabled", async () => {
    run(() => useDisclosedSecrets(ref(false)));
    await flushPromises();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
