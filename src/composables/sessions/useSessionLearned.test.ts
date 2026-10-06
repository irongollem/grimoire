import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";

type Result = { data: unknown; error: Error | null };

const db = vi.hoisted(() => ({
  results: {} as Record<string, Result>,
  calls: [] as { table: string; op: string; args: unknown[] }[],
}));

/** A chainable stand-in for a PostgREST builder: a promise resolved per table, with the filter methods on it. */
function builder(table: string) {
  const chain: Promise<Result> = Promise.resolve(db.results[table] ?? { data: [], error: null });
  for (const op of ["select", "eq", "is", "in", "or", "update", "match", "order", "range"]) {
    Object.defineProperty(chain, op, {
      value: (...args: unknown[]) => {
        db.calls.push({ table, op, args });
        return chain;
      },
    });
  }
  return chain;
}
vi.mock("@/lib/supabase", () => ({ supabase: { from: (table: string) => builder(table) } }));
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

describe("useSessionLearned", () => {
  beforeEach(() => {
    db.results = {};
    db.calls = [];
  });

  it("shapes one session's people, creatures and quest steps", async () => {
    db.results.npc_reveals = {
      data: [
        { npc_id: "n1", party_member_id: "m1", revealed_at: "2026-10-04T19:00:00Z", approximate: false, session_id: "s1", npcs: { name: "Old Marta" } },
        { npc_id: "n1", party_member_id: "m2", revealed_at: "2026-10-04T19:01:00Z", approximate: false, session_id: "s1", npcs: { name: "Old Marta" } },
      ],
      error: null,
    };
    db.results.discovered_monsters = {
      data: [{ id: "d1", monster_id: null, library_monster_id: "srd_owlbear", visible_to: null, discovered_at: "2026-10-04T20:00:00Z", session_id: "s1", monsters: null }],
      error: null,
    };
    db.results.library_monsters = { data: [{ id: "srd_owlbear", name: "Owlbear" }], error: null };
    db.results.quest_beat_transitions = {
      data: [{ id: "t1", to_quest_id: "q1", to_quest_title: "Into the Mere", to_beat_title: "The Gate", transition_kind: "enter", created_at: "2026-10-04T19:30:00Z", seq: 1, session_id: "s1" }],
      error: null,
    };
    const { value } = mountWith(() => useSessionLearned("s1"));
    await flushPromises();

    expect(value.entries.value.map((e) => [e.kind, e.name, e.detail])).toEqual([
      ["creature", "Owlbear", "The whole party"],
      ["quest", "Into the Mere", "Began · The Gate"],
      ["person", "Old Marta", "The whole party"],
    ]);
    expect(db.calls).toContainEqual({ table: "npc_reveals", op: "eq", args: ["session_id", "s1"] });
    expect(db.calls).toContainEqual({ table: "encounter_state", op: "eq", args: ["session_id", "s1"] });
  });

  it("reads the unsorted list as session_id is null, without combat", async () => {
    const { client } = mountWith(() => useUnsortedLearned());
    await flushPromises();
    expect(db.calls).toContainEqual({ table: "location_reveals", op: "is", args: ["session_id", null] });
    expect(db.calls.some((c) => c.table === "encounter_state")).toBe(false);
    expect(client.getQueryCache().find({ queryKey: ["session-learned", "c-1", "unsorted"] })).toBeDefined();
  });

  it("reports a failed read instead of an empty list", async () => {
    db.results.npc_reveals = { data: null, error: new Error("denied") };
    const { value } = mountWith(() => useSessionLearned("s1"));
    await flushPromises();
    expect(value.error.value?.message).toBe("denied");
  });
});

describe("useMoveLearned", () => {
  beforeEach(() => {
    db.results = {};
    db.calls = [];
  });

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

  it("sets session_id on every underlying row and refreshes the lists", async () => {
    const { client, value } = mountWith(() => useMoveLearned());
    const spy = vi.spyOn(client, "invalidateQueries");
    await value.mutateAsync({ entries: [entry], sessionId: "s2" });
    const updates = db.calls.filter((c) => c.op === "update");
    expect(updates).toHaveLength(2);
    expect(updates[0]?.args).toEqual([{ session_id: "s2" }]);
    expect(db.calls.filter((c) => c.op === "match").map((c) => c.args[0])).toEqual([
      { npc_id: "n1", party_member_id: "m1" },
      { npc_id: "n1", party_member_id: "m2" },
    ]);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["session-learned"] });
  });

  it("files under no session with null", async () => {
    const { value } = mountWith(() => useMoveLearned());
    await value.mutateAsync({ entries: [entry], sessionId: null });
    expect(db.calls.find((c) => c.op === "update")?.args).toEqual([{ session_id: null }]);
  });

  it("throws a refused update", async () => {
    db.results.npc_reveals = { data: null, error: new Error("refused") };
    const { value } = mountWith(() => useMoveLearned());
    await expect(value.mutateAsync({ entries: [entry], sessionId: "s2" })).rejects.toThrow("refused");
  });
});

describe("useFileShared", () => {
  beforeEach(() => {
    db.results = {};
    db.calls = [];
  });

  it("files only the chosen members' reveals that are not already in the session", async () => {
    const { value } = mountWith(() => useFileShared());
    await value.mutateAsync({
      table: "location_reveals",
      entityColumn: "location_id",
      entityId: "l1",
      memberIds: ["m1", "m2"],
      sessionId: "s2",
    });
    expect(db.calls.map((c) => [c.table, c.op, c.args])).toEqual([
      ["location_reveals", "update", [{ session_id: "s2" }]],
      ["location_reveals", "eq", ["location_id", "l1"]],
      ["location_reveals", "in", ["party_member_id", ["m1", "m2"]]],
      ["location_reveals", "or", ["session_id.is.null,session_id.neq.s2"]],
    ]);
  });

  it("files a creature by its discovery row", async () => {
    const { value } = mountWith(() => useFileShared());
    await value.mutateAsync({ table: "discovered_monsters", id: "d1", sessionId: "s2" });
    expect(db.calls.find((c) => c.op === "eq")?.args).toEqual(["id", "d1"]);
  });

  it("throws a refused update", async () => {
    db.results.handout_reveals = { data: null, error: new Error("refused") };
    const { value } = mountWith(() => useFileShared());
    await expect(
      value.mutateAsync({ table: "handout_reveals", entityColumn: "document_id", entityId: "h1", memberIds: ["m1"], sessionId: "s2" }),
    ).rejects.toThrow("refused");
  });
});
