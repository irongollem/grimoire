import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c-1" }) }));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({
    data: ref([
      { id: "m1", name: "Wren" },
      { id: "m2", name: "Brakka" },
    ]),
  }),
}));

import { useFileShared, useMoveLearned, useSessionLearned, useUnsortedLearned } from "./useSessionLearned";

function mountWith<T>(make: () => T): { client: QueryClient; value: T } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  let value!: T;
  mount(
    defineComponent({
      setup() {
        value = make();
        return () => null;
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } },
  );
  return { client, value };
}

/** A reveal row as the app reads it: the entity's name rides along as an embed. */
const npcReveal = (npc_id: string, party_member_id: string, over: Record<string, unknown> = {}) => ({
  campaign_id: "c-1", npc_id, party_member_id, revealed_at: "2026-10-04T19:00:00Z", approximate: false,
  session_id: "s1", npcs: { name: "Old Marta" }, ...over,
});

describe("useSessionLearned", () => {
  beforeEach(() => fake.reset());

  it("shapes one session's people, creatures and quest steps, and only that session's, in this campaign", async () => {
    fake.seed("npc_reveals", [
      npcReveal("n1", "m1"),
      npcReveal("n1", "m2", { revealed_at: "2026-10-04T19:01:00Z" }),
      npcReveal("n-other-session", "m1", { session_id: "s2", npcs: { name: "Elsewhen" } }),
      npcReveal("n-unsorted", "m1", { session_id: null, npcs: { name: "Unsorted" } }),
      npcReveal("n-other-campaign", "m1", { campaign_id: "c-2", npcs: { name: "Elsewhere" } }),
    ]);
    fake.seed("discovered_monsters", [
      { id: "d1", campaign_id: "c-1", monster_id: null, library_monster_id: "srd_owlbear", visible_to: null, discovered_at: "2026-10-04T20:00:00Z", session_id: "s1", monsters: null },
      { id: "d3", campaign_id: "c-2", monster_id: null, library_monster_id: "srd_ogre", visible_to: null, discovered_at: "2026-10-04T20:00:00Z", session_id: "s1", monsters: null },
      { id: "d2", campaign_id: "c-1", monster_id: null, library_monster_id: "srd_ogre", visible_to: null, discovered_at: "2026-10-04T20:00:00Z", session_id: "s2", monsters: null },
    ]);
    fake.seed("library_monsters", [{ id: "srd_owlbear", name: "Owlbear" }, { id: "srd_ogre", name: "Ogre" }]);
    fake.seed("quest_beat_transitions", [
      { id: "t1", campaign_id: "c-1", to_quest_id: "q1", to_quest_title: "Into the Mere", to_beat_title: "The Gate", transition_kind: "enter", created_at: "2026-10-04T19:30:00Z", seq: 1, session_id: "s1" },
      { id: "t2", campaign_id: "c-2", to_quest_id: "q9", to_quest_title: "Not Ours", to_beat_title: null, transition_kind: "enter", created_at: "2026-10-04T19:30:00Z", seq: 1, session_id: "s1" },
    ]);
    fake.seed("encounter_state", [
      { id: "e1", campaign_id: "c-1", encounter_id: "enc1", started_at: "2026-10-04T21:00:00Z", updated_at: "2026-10-04T21:30:00Z", session_id: "s1", encounters: { name: "Mere Ambush" } },
      { id: "e2", campaign_id: "c-1", encounter_id: "enc2", started_at: null, updated_at: "2026-10-05T21:30:00Z", session_id: "s2", encounters: { name: "Next Week" } },
    ]);
    const { value } = mountWith(() => useSessionLearned("s1"));
    await flushPromises();

    // Newest first: the fight at 21:00, the owlbear at 20:00, the quest at 19:30, the people at 19:00.
    expect(value.entries.value.map((e) => [e.kind, e.name, e.detail])).toEqual([
      ["combat", "Mere Ambush", ""],
      ["creature", "Owlbear", "The whole party"],
      ["quest", "Into the Mere", "Began · The Gate"],
      ["person", "Old Marta", "The whole party"],
    ]);
  });

  it("reads the unsorted list as the rows filed under no session, without combat", async () => {
    fake.seed("npc_reveals", [npcReveal("n-unsorted", "m1", { session_id: null, npcs: { name: "Unsorted" } }), npcReveal("n1", "m1")]);
    const { value, client } = mountWith(() => useUnsortedLearned());
    await flushPromises();
    expect(value.entries.value.map((e) => e.name)).toEqual(["Unsorted"]);
    expect(fake.calls.some((c) => c.target === "encounter_state")).toBe(false);
    expect(client.getQueryCache().find({ queryKey: ["session-learned", "c-1", "unsorted"] })).toBeDefined();
  });

  it("reports a failed creature-name lookup instead of naming them all 'A creature'", async () => {
    fake.seed("discovered_monsters", [
      { id: "d1", campaign_id: "c-1", monster_id: null, library_monster_id: "srd_owlbear", visible_to: null, discovered_at: "2026-10-04T20:00:00Z", session_id: "s1", monsters: null },
    ]);
    fake.failNext("library_monsters", { message: "denied" });
    const { value } = mountWith(() => useSessionLearned("s1"));
    await flushPromises();
    expect(value.error.value?.message).toBe("denied");
  });

  it("reports a failed read instead of an empty list", async () => {
    fake.failNext("npc_reveals", { message: "denied" });
    const { value } = mountWith(() => useSessionLearned("s1"));
    await flushPromises();
    expect(value.error.value?.message).toBe("denied");
  });
});

describe("useMoveLearned", () => {
  beforeEach(() => fake.reset());

  const entry = {
    kind: "person" as const,
    key: "k",
    entityId: "n1",
    name: "Old Marta",
    detail: "",
    whenIso: "2026-10-04T19:00:00Z",
    approximate: false,
    sessionId: null,
    recordRefs: [
      { table: "npc_reveals" as const, match: { npc_id: "n1", party_member_id: "m1" } },
      { table: "npc_reveals" as const, match: { npc_id: "n1", party_member_id: "m2" } },
    ],
  };
  const sessionOf = () => fake.rows("npc_reveals").map((r) => [r.party_member_id, r.session_id]);

  beforeEach(() => {
    fake.seed("npc_reveals", [
      npcReveal("n1", "m1", { session_id: null }),
      npcReveal("n1", "m2", { session_id: null }),
      npcReveal("n1", "m3", { session_id: null }),
      npcReveal("n2", "m1", { session_id: null }),
    ]);
  });

  it("sets session_id on the rows behind the entries and no others, and refreshes the lists", async () => {
    const { client, value } = mountWith(() => useMoveLearned());
    const spy = vi.spyOn(client, "invalidateQueries");
    await value.mutateAsync({ entries: [entry], sessionId: "s2" });
    expect(sessionOf()).toEqual([["m1", "s2"], ["m2", "s2"], ["m3", null], ["m1", null]]);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["session-learned"] });
  });

  it("files under no session with null", async () => {
    fake.reset();
    fake.seed("npc_reveals", [npcReveal("n1", "m1", { session_id: "s1" }), npcReveal("n1", "m2", { session_id: "s1" })]);
    const { value } = mountWith(() => useMoveLearned());
    await value.mutateAsync({ entries: [entry], sessionId: null });
    expect(sessionOf()).toEqual([["m1", null], ["m2", null]]);
  });

  it("throws a refused update", async () => {
    fake.failNext("npc_reveals", { message: "refused" });
    const { value } = mountWith(() => useMoveLearned());
    await expect(value.mutateAsync({ entries: [entry], sessionId: "s2" })).rejects.toMatchObject({ message: "refused" });
  });
});

describe("useFileShared", () => {
  beforeEach(() => fake.reset());

  it("files only the chosen members' reveals of that place", async () => {
    fake.seed("location_reveals", [
      { campaign_id: "c-1", location_id: "l1", party_member_id: "m1", session_id: null },
      { campaign_id: "c-1", location_id: "l1", party_member_id: "m2", session_id: null },
      { campaign_id: "c-1", location_id: "l1", party_member_id: "m3", session_id: null },
      { campaign_id: "c-1", location_id: "l2", party_member_id: "m1", session_id: null },
    ]);
    const { value } = mountWith(() => useFileShared());
    await value.mutateAsync({
      table: "location_reveals",
      entityColumn: "location_id",
      entityId: "l1",
      memberIds: ["m1", "m2"],
      sessionId: "s2",
    });
    expect(fake.rows("location_reveals").map((r) => [r.location_id, r.party_member_id, r.session_id])).toEqual([
      ["l1", "m1", "s2"], ["l1", "m2", "s2"], ["l1", "m3", null], ["l2", "m1", null],
    ]);
  });

  it("files a creature by its discovery row", async () => {
    fake.seed("discovered_monsters", [{ id: "d1", session_id: null }, { id: "d2", session_id: null }]);
    const { value } = mountWith(() => useFileShared());
    await value.mutateAsync({ table: "discovered_monsters", id: "d1", sessionId: "s2" });
    expect(fake.rows("discovered_monsters")).toEqual([{ id: "d1", session_id: "s2" }, { id: "d2", session_id: null }]);
  });

  it("throws a refused update", async () => {
    fake.failNext("handout_reveals", { message: "refused" });
    const { value } = mountWith(() => useFileShared());
    await expect(
      value.mutateAsync({ table: "handout_reveals", entityColumn: "document_id", entityId: "h1", memberIds: ["m1"], sessionId: "s2" }),
    ).rejects.toMatchObject({ message: "refused" });
  });
});
