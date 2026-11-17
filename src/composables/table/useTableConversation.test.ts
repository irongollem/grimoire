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
import { useTableConversation } from "./useTableConversation";

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

const session = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  user_id: "u1",
  campaign_id: "c1",
  party_member_id: "m1",
  scene_location_id: "l1",
  credits_spent: 3,
  ...over,
});

beforeEach(() => {
  fake.reset();
  setActivePinia(createPinia());
  useAuthStore().user = { id: "u1" } as User;
});

describe("useTableConversation", () => {
  // Bug caught: opening another account's sitting by its id, drawing their conversation.
  it("refuses a sitting that belongs to another account or another campaign", async () => {
    fake.seed("agent_sessions", [session("theirs", { user_id: "u2" }), session("elsewhere", { campaign_id: "c2" })]);
    for (const id of ["theirs", "elsewhere"]) {
      const r = mountWith(() => useTableConversation(id, "c1"));
      await vi.waitFor(() => expect(r.isError.value).toBe(true));
      expect(r.data.value).toBeUndefined();
    }
  });

  // Bug caught: a fact the party has not learned yet (hidden from the player) shown on the page, or another
  // conversation's turns mixed into this story.
  it("draws this sitting's story and only the facts the party knows, in this conversation", async () => {
    fake.seed("agent_sessions", [session("s1")]);
    fake.seed("agent_turns", [
      { id: "t1", session_id: "s1", user_id: "u1", seq: 1, role: "user", blocks: [{ type: "text", text: "for the model", player: { kind: "say", text: "Hello" } }] },
      { id: "t2", session_id: "other", user_id: "u1", seq: 1, role: "assistant", blocks: [{ type: "text", text: "another story" }] },
    ]);
    fake.seed("story_facts", [
      { id: "f1", campaign_id: "c1", agent_session_id: "s1", known_to_player: true, body: "Known.", created_at: "2026-11-10T10:00:00Z" },
      { id: "f2", campaign_id: "c1", agent_session_id: "s1", known_to_player: false, body: "Hidden.", created_at: "2026-11-10T10:01:00Z" },
      { id: "f3", campaign_id: "c1", agent_session_id: "other", known_to_player: true, body: "Elsewhere.", created_at: "2026-11-10T10:02:00Z" },
    ]);
    const r = mountWith(() => useTableConversation("s1", "c1"));
    await vi.waitFor(() => expect(r.data.value).toBeDefined());
    expect(r.data.value?.items.map((i) => ("text" in i ? i.text : ""))).toEqual(["Hello", "On record: Known."]);
    expect(r.data.value?.sitting.credits_spent).toBe(3);
  });
});
