import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import PlayerNpcMemories from "./PlayerNpcMemories.vue";

const memories = ref<unknown[]>([]);
const sessions = ref<unknown[]>([]);
vi.mock("@/composables/npcs/useNpcMemories", () => ({ useMyNpcMemories: () => ({ data: memories }) }));
vi.mock("@/composables/sessions/usePlayerSessions", () => ({ usePlayerSessions: () => ({ data: sessions }) }));

const session = (id: string, number: number, played_on: string) => ({
  id,
  number,
  title: null,
  played_on,
  started_at: null,
  ended_at: null,
});
const memory = (id: string, session_id: string | null, body: string, created_at: string) => ({
  id,
  npc_id: "n1",
  kind: "revealed",
  body,
  session_id,
  created_at,
});

describe("PlayerNpcMemories", () => {
  it("draws nothing when no lines are shared", () => {
    memories.value = [];
    const wrapper = mount(PlayerNpcMemories, { props: { npcId: "n1" } });
    expect(wrapper.text()).toBe("");
  });

  it("groups lines by session, newest session first, with the player's kind label", () => {
    sessions.value = [session("s1", 1, "2026-01-01"), session("s2", 2, "2026-02-01")];
    memories.value = [
      memory("a", "s1", "Owes the smith.", "2026-01-01T10:00:00Z"),
      memory("b", "s2", "Fears the mere.", "2026-02-01T10:00:00Z"),
      memory("c", null, "Was a soldier.", "2025-12-01T10:00:00Z"),
    ];
    const text = mount(PlayerNpcMemories, { props: { npcId: "n1" } }).text();
    expect(text).toContain("WHAT WE KNOW");
    expect(text).toContain("Told us");
    expect(text.indexOf("Session 2")).toBeLessThan(text.indexOf("Session 1"));
    expect(text.indexOf("Session 1")).toBeLessThan(text.indexOf("Before the log"));
    expect(text).toContain("Fears the mere.");
  });
});
