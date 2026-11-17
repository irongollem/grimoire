import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createApp, defineComponent, h } from "vue";
import { createPinia, setActivePinia } from "pinia";
import type { User } from "@supabase/supabase-js";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "u1" }) }));

import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useTableSessions } from "./useTableSessions";

function mountWith<T>(setup: () => T): T {
  let out!: T;
  const app = createApp(
    defineComponent({
      setup() {
        out = setup();
        return () => h("div");
      },
    }),
  );
  app.use(VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) });
  app.mount(document.createElement("div"));
  return out;
}

const row = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  user_id: "u1",
  campaign_id: "c1",
  party_member_id: "m1",
  scene_location_id: null,
  credits_spent: 0,
  created_at: "2026-11-10T10:00:00Z",
  updated_at: "2026-11-10T10:00:00Z",
  ...over,
});

beforeEach(() => {
  fake.reset();
  setActivePinia(createPinia());
  useAuthStore().user = { id: "u1" } as User;
  useCampaignStore().activeCampaignId = "c1";
});

describe("useTableSessions", () => {
  // Bug caught: a read that leans on RLS alone: the day a co-DM policy widens it, the list shows other people's
  // sittings (and their characters) to the one account it widened for.
  it("lists only my sittings in this campaign, newest first, never another account's or another campaign's", async () => {
    fake.seed("party_members", [{ id: "m1", campaign_id: "c1", name: "Inkling" }]);
    fake.seed("agent_sessions", [
      row("mine-old", { updated_at: "2026-11-01T10:00:00Z" }),
      row("mine-new", { updated_at: "2026-11-12T10:00:00Z" }),
      row("theirs", { user_id: "u2", updated_at: "2026-11-13T10:00:00Z" }),
      row("elsewhere", { campaign_id: "c2", updated_at: "2026-11-14T10:00:00Z" }),
    ]);
    const r = mountWith(() => useTableSessions(() => useCampaignStore().activeCampaignId));
    await vi.waitFor(() => expect(r.data.value).toBeDefined());
    expect(r.sittings.value.map((s) => s.id)).toEqual(["mine-new", "mine-old"]);
  });

  // Bug caught: the sitting listed under the bare id, so the player cannot tell their sittings apart.
  it("names the character played, and says nothing for one that left the party", async () => {
    fake.seed("party_members", [{ id: "m1", campaign_id: "c1", name: "Inkling" }]);
    fake.seed("agent_sessions", [row("a"), row("b", { party_member_id: "gone" })]);
    const r = mountWith(() => useTableSessions(() => useCampaignStore().activeCampaignId));
    await vi.waitFor(() => expect(r.sittings.value).toHaveLength(2));
    const byId = Object.fromEntries(r.sittings.value.map((s) => [s.id, s.characterName]));
    expect(byId).toEqual({ a: "Inkling", b: null });
  });

  // Bug caught: swallowing a failed read as "no sittings", which reads as a lost story.
  it("reports a failed read instead of showing an empty list", async () => {
    fake.failNext("agent_sessions", { message: "boom" });
    const r = mountWith(() => useTableSessions(() => useCampaignStore().activeCampaignId));
    await vi.waitFor(() => expect(r.isError.value).toBe(true));
    expect(r.sittings.value).toEqual([]);
  });
});
