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
    expect(r.data.value?.items.map((i) => ("text" in i ? i.text : ""))).toEqual(["Hello", "Known."]);
    expect(r.data.value?.sitting.credits_spent).toBe(3);
  });

  // Bug caught: a fact the DM struck (it never happened) still told in the story.
  it("leaves a struck fact out of the story", async () => {
    fake.seed("agent_sessions", [session("s1")]);
    fake.seed("story_facts", [
      { id: "f1", campaign_id: "c1", agent_session_id: "s1", known_to_player: true, body: "Kept.", struck_at: null, created_at: "2026-11-10T10:00:00Z" },
      { id: "f2", campaign_id: "c1", agent_session_id: "s1", known_to_player: true, body: "Struck.", struck_at: "2026-11-11T10:00:00Z", created_at: "2026-11-10T10:01:00Z" },
    ]);
    const r = mountWith(() => useTableConversation("s1", "c1"));
    await vi.waitFor(() => expect(r.data.value).toBeDefined());
    expect(r.data.value?.items.map((i) => ("text" in i ? i.text : ""))).toEqual(["Kept."]);
  });

  // Bug caught: a reloaded sitting losing its countdown; the label (what is coming) reaching the page; or a clock
  // of another campaign being drawn because the read named only its id.
  it("reads how full this campaign's pressure clock is, and nothing else of it", async () => {
    fake.seed("agent_sessions", [session("s1", { pressure_clock_id: "k1" }), session("s2", { pressure_clock_id: "k2" })]);
    fake.seed("quest_clocks", [
      { id: "k1", campaign_id: "c1", label: "LABEL-MARK", filled: 2, segments: 5 },
      { id: "k2", campaign_id: "c2", label: "elsewhere", filled: 1, segments: 3 },
    ]);
    const mine = mountWith(() => useTableConversation("s1", "c1"));
    await vi.waitFor(() => expect(mine.data.value).toBeDefined());
    expect(mine.data.value?.sitting.pressure).toEqual({ filled: 2, segments: 5 });
    expect(JSON.stringify(mine.data.value)).not.toContain("LABEL-MARK");

    const other = mountWith(() => useTableConversation("s2", "c1"));
    await vi.waitFor(() => expect(other.data.value).toBeDefined());
    expect(other.data.value?.sitting.pressure).toBeNull();
  });
  // Bug caught: the number to beat reaching the page's state from the stored request, readable in devtools.
  it("keeps what is asked for but never the number to beat", async () => {
    fake.seed("agent_sessions", [session("s1", { pending_roll: { label: "Wisdom (Perception)", kind: "check", ability: "wis", skill: "perception", dc: 31337 } })]);
    const r = mountWith(() => useTableConversation("s1", "c1"));
    await vi.waitFor(() => expect(r.data.value).toBeDefined());
    expect(r.data.value?.sitting.pending_roll).toEqual({ label: "Wisdom (Perception)", kind: "check", ability: "wis", skill: "perception" });
    expect(JSON.stringify(r.data.value)).not.toContain("31337");
  });

  // Bug caught: a malformed or absent stored request drawing a card the server would refuse an answer to.
  it("reads nothing asked from a null or malformed request", async () => {
    fake.seed("agent_sessions", [session("s1", { pending_roll: null }), session("s2", { pending_roll: { label: "x", kind: "check", ability: "luck", skill: null, dc: 31337 } })]);
    for (const id of ["s1", "s2"]) {
      const r = mountWith(() => useTableConversation(id, "c1"));
      await vi.waitFor(() => expect(r.data.value).toBeDefined());
      expect(r.data.value?.sitting.pending_roll).toBeNull();
      expect(JSON.stringify(r.data.value)).not.toContain("31337");
    }
  });
  // Bug caught (seen in play): a reopened fight read as its narration alone, the board's lines gone; or another
  // sitting's (or another account's) lines drawn into this one.
  it("puts the board's lines of this sitting back among its turns, and no one else's", async () => {
    fake.seed("agent_sessions", [session("mine")]);
    fake.seed("agent_turns", [
      { session_id: "mine", user_id: "u1", seq: 1, role: "user", blocks: [{ type: "text", text: "x", player: { kind: "do", text: "I draw my sword." } }] },
      { session_id: "mine", user_id: "u1", seq: 2, role: "user", blocks: [{ type: "text", text: "y", player: { kind: "do", text: "I catch my breath." } }] },
    ]);
    fake.seed("agent_board_lines", [
      { session_id: "mine", user_id: "u1", seq: 1, after_turns: 1, line: { kind: "margin", text: "Round 1 · your turn" }, by_server: true },
      { session_id: "other", user_id: "u1", seq: 2, after_turns: 1, line: { kind: "margin", text: "another sitting" }, by_server: true },
      { session_id: "mine", user_id: "u2", seq: 3, after_turns: 1, line: { kind: "margin", text: "another account" }, by_server: true },
    ]);
    const query = mountWith(() => useTableConversation("mine", "c1"));
    await vi.waitFor(() => expect(query.data.value).toBeDefined());
    expect(query.data.value!.items.map((i) => ("text" in i ? i.text : i.kind))).toEqual(["I draw my sword.", "Round 1 · your turn", "I catch my breath."]);
    expect(query.data.value!.turns).toBe(2);
  });
});
