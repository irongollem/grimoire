import { describe, expect, it, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insertResult: { data: null as unknown, error: null as Error | null },
  deleteResult: { error: null as Error | null },
  campaignStore: { activeCampaignId: null as string | null },
  selects: [] as string[],
  limits: [] as number[],
}));

vi.mock("@/lib/supabase", () => {
  const empty = Promise.resolve({ data: [], error: null });
  const chain: Record<string, unknown> = {
    select: (columns: string) => { mocks.selects.push(columns); return chain; },
    eq: () => chain,
    order: () => chain,
    limit: (n: number) => { mocks.limits.push(n); return empty; },
    maybeSingle: () => empty,
    single: () => Promise.resolve(mocks.insertResult),
    insert: () => chain,
    delete: () => ({ eq: () => Promise.resolve(mocks.deleteResult) }),
  };
  return { supabase: { from: () => chain, rpc: vi.fn() } };
});
vi.mock("@/lib/realtimeChannel", () => ({
  createRealtimeChannel: () => ({ stop: vi.fn() }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => mocks.campaignStore }));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ user: { id: "u1" }, isDM: false, profile: null }),
}));
vi.mock("@/stores/ui", () => ({
  useUiStore: () => ({ dmPreviewMode: false }),
}));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/campaign/useCampaignMembers", () => ({
  useCampaignMembers: () => ({ data: { value: [] } }),
}));

import { useCampaignMessages } from "./useCampaignMessages";

describe("useCampaignMessages write errors", () => {
  beforeEach(() => {
    mocks.insertResult = { data: null, error: null };
    mocks.deleteResult = { error: null };
    mocks.campaignStore.activeCampaignId = "c1";
  });

  it("sendMessage throws a refused insert instead of vanishing", async () => {
    const refused = new Error("new row violates row-level security policy");
    mocks.insertResult = { data: null, error: refused };
    const { sendMessage, messages } = useCampaignMessages();
    await expect(sendMessage("psst", "u2")).rejects.toBe(refused);
    expect(messages.value).toHaveLength(0);
  });

  it("deleteMessage throws a refused delete", async () => {
    const refused = new Error("denied");
    mocks.deleteResult = { error: refused };
    const { deleteMessage } = useCampaignMessages();
    await expect(deleteMessage("m1")).rejects.toBe(refused);
  });
});

describe("useCampaignMessages history (#999)", () => {
  it("reads only a narrow probe while the chat has never been opened, then the full window once", async () => {
    mocks.selects.length = 0;
    mocks.limits.length = 0;
    mocks.campaignStore.activeCampaignId = "c-probe";
    // The watcher is module-level and starts once; take a fresh module for it.
    vi.resetModules();
    const { useCampaignMessages, loadChatHistory } = await import("./useCampaignMessages");
    useCampaignMessages();
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.selects).toHaveLength(1);
    expect(mocks.selects[0]).not.toBe("*");
    expect(mocks.limits).toEqual([20]);

    loadChatHistory();
    loadChatHistory();
    await Promise.resolve();
    await Promise.resolve();
    expect(mocks.selects.filter((c) => c === "*")).toHaveLength(1);
    expect(mocks.limits).toEqual([20, 100]);
  });
});
