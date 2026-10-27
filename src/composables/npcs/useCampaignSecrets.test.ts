import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

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
    fake.reset();
    stores.campaign.activeCampaignId = "c-1";
    data.sessions = [{ id: "s-14", number: 14 }];
    data.npcs = [{ id: "n-1", name: "Bram", disguise_name: null, disguise_portrait_url: null, is_revealed: true }];
  });

  it("lists the campaign's secrets through the RPC", async () => {
    const rows = [{ entity_type: "location", entity_id: "l-1", entity_name: "Crypt", field: "description", secret_id: "x", excerpt: "..." }];
    fake.onRpc("list_campaign_secrets", () => rows);
    const { result } = run(() => useCampaignSecrets());
    await flushPromises();
    expect(result().data.value).toEqual(rows);
  });

  it("does not fetch when disabled", async () => {
    fake.onRpc("list_campaign_secrets", () => []);
    run(() => useCampaignSecrets(ref(false)));
    await flushPromises();
    expect(fake.calls).toEqual([]);
  });

  it("surfaces the RPC error", async () => {
    fake.failNext("list_campaign_secrets", { message: "Not authorized" });
    const { result } = run(() => useCampaignSecrets());
    await flushPromises();
    expect(result().error.value?.message).toBe("Not authorized");
  });

  it("labels each disclosed secret by its earliest memory, from this campaign only and only memories that disclose one", async () => {
    fake.seed("npc_memories", [
      { id: "m1", campaign_id: "c-1", secret_id: "x", npc_id: "n-1", session_id: "s-14", created_at: "2026-01-02" },
      { id: "m2", campaign_id: "c-1", secret_id: "y", npc_id: "n-1", session_id: null, created_at: "2026-01-03" },
      { id: "m3", campaign_id: "c-1", secret_id: null, npc_id: "n-1", session_id: "s-14", created_at: "2026-01-04" },
      { id: "m4", campaign_id: "c-2", secret_id: "z", npc_id: "n-1", session_id: "s-14", created_at: "2026-01-05" },
    ]);
    const { result } = run(() => useDisclosedSecrets());
    await flushPromises();
    expect([...result().labels.value.keys()].sort()).toEqual(["x", "y"]);
    expect(result().labels.value.get("x")).toBe("known since Session 14 (Bram)");
    expect(result().labels.value.get("y")).toBe("known to the party (Bram)");
  });

  it("does not read memories when disabled", async () => {
    run(() => useDisclosedSecrets(ref(false)));
    await flushPromises();
    expect(fake.calls).toEqual([]);
  });
});
