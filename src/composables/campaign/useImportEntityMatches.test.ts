import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const mocks = vi.hoisted(() => ({
  invokeCalls: [] as { fn: string; body: unknown }[],
  response: { matches: {}, semantic: true } as unknown,
  error: null as Error | null,
  deities: null as unknown as { data: unknown; isLoading: boolean },
}));

vi.mock("@/composables/deities/useDeities", async () => {
  const { computed, reactive } = await import("vue");
  mocks.deities = reactive({ data: undefined as unknown, isLoading: false });
  return { useAllDeities: () => ({ data: computed(() => mocks.deities.data), isLoading: computed(() => mocks.deities.isLoading) }) };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(async (fn: string, opts: { body: unknown }) => {
        mocks.invokeCalls.push({ fn, body: opts.body });
        return { data: mocks.error ? null : mocks.response, error: mocks.error };
      }),
    },
  },
}));

import { buildImportMatchRequest, useImportEntityMatches } from "./useImportEntityMatches";
import type { UsableEntity } from "@/lib/documentImport/sanitizeEntities";
import type { ImportEntityKind } from "@/types/documentImport.types";

function entity(ref: string, data: Record<string, unknown>): UsableEntity {
  return { ref, page: 1, confidence: "complete", data };
}

// The client would retry a failure if the query let it; the hook must not.
function open(importRowId: string | null, entitiesByKind: Parameters<typeof useImportEntityMatches>[1]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 2, retryDelay: 0 } } });
  let api!: ReturnType<typeof useImportEntityMatches>;
  mount(
    defineComponent({
      setup() {
        api = useImportEntityMatches(importRowId, entitiesByKind);
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return { api: () => api };
}

beforeEach(() => {
  mocks.invokeCalls = [];
  mocks.response = { matches: {}, semantic: true };
  mocks.error = null;
  Object.assign(mocks.deities, { data: undefined, isLoading: false });
});

describe("buildImportMatchRequest", () => {
  it("builds one entry per kind with usable entities, keyed by the kind's display field", () => {
    const body = buildImportMatchRequest("row-1", {
      npcs: [entity("n1", { name: "Captain Reyes" })],
      quests: [entity("q1", { title: "The Sunken Road" })],
    });
    expect(body).toEqual({
      id: "row-1",
      entities: {
        npcs: [{ ref: "n1", name: "Captain Reyes", data: { name: "Captain Reyes" } }],
        quests: [{ ref: "q1", name: "The Sunken Road", data: { title: "The Sunken Road" } }],
      },
    });
  });

  it("omits a kind with no entities and drops an entity with a blank heading", () => {
    const body = buildImportMatchRequest("row-1", {
      npcs: [entity("n1", { name: "  " }), entity("n2", { name: "Real Name" })],
      items: [],
    });
    expect(body.entities.items).toBeUndefined();
    expect(body.entities.npcs).toEqual([{ ref: "n2", name: "Real Name", data: { name: "Real Name" } }]);
  });
});

describe("useImportEntityMatches", () => {
  it("does not call the edge function while there is no row id", async () => {
    const { api } = open(null, { npcs: [entity("n1", { name: "Goblin" })] });
    await flushPromises();
    expect(mocks.invokeCalls).toHaveLength(0);
    expect(api().candidatesFor("npcs").size).toBe(0);
  });

  it("does not call the edge function when there is nothing to match", async () => {
    const { api } = open("row-1", {});
    await flushPromises();
    expect(mocks.invokeCalls).toHaveLength(0);
    expect(api().candidatesFor("npcs").size).toBe(0);
  });

  it("fetches once for a row id and parses candidates back by kind and ref", async () => {
    mocks.response = {
      matches: {
        npcs: {
          n1: [{ targetId: "id-1", source: "campaign", name: "Goblin Scout", matchKind: "exact", detail: null, distance: null }],
        },
      },
      semantic: true,
    };
    const { api } = open("row-1", { npcs: [entity("n1", { name: "Goblin" })] });
    await flushPromises();

    expect(mocks.invokeCalls).toEqual([{ fn: "import-match", body: { id: "row-1", entities: { npcs: [{ ref: "n1", name: "Goblin", data: { name: "Goblin" } }] } } }]);
    expect(api().candidatesFor("npcs").get("n1")).toEqual([
      { targetId: "id-1", source: "campaign", name: "Goblin Scout", matchKind: "exact", detail: null, distance: null },
    ]);
    expect(api().semantic.value).toBe(true);
    expect(api().isLoading.value).toBe(false);
  });

  it("does not fetch again when the DM edits the entities in the review card", async () => {
    const entities = ref<Partial<Record<ImportEntityKind, readonly UsableEntity[]>>>({ npcs: [entity("n1", { name: "Goblin" })] });
    open("row-1", entities);
    await flushPromises();
    entities.value = { npcs: [entity("n1", { name: "Goblin Scout" })] };
    await flushPromises();
    expect(mocks.invokeCalls).toHaveLength(1);
  });

  it("surfaces an edge function error rather than silently returning empty candidates", async () => {
    mocks.error = new Error("rate_limited");
    const { api } = open("row-1", { npcs: [entity("n1", { name: "Goblin" })] });
    await flushPromises();

    expect(api().error.value?.message).toContain("rate_limited");
    expect(mocks.invokeCalls).toHaveLength(1);
    expect(api().candidatesFor("npcs").size).toBe(0);
  });

  it("appends a deity the page names to the NPC's candidates, and stays loading until the deities arrive", async () => {
    Object.assign(mocks.deities, { data: [{ id: "d1", name: "Moradin", titles: null }], isLoading: true });
    const { api } = open("row-1", { npcs: [entity("n1", { name: "Moradin" })] });
    await flushPromises();
    // The match call is done, the deities are not: seeding now would default a god to "Create new".
    expect(api().isLoading.value).toBe(true);

    Object.assign(mocks.deities, { data: [{ id: "d1", name: "Moradin", titles: null }], isLoading: false });
    await flushPromises();
    expect(api().isLoading.value).toBe(false);
    expect(api().candidatesFor("npcs").get("n1")?.some((c) => c.source === "deity" && c.targetId === "d1")).toBe(true);
  });

  it("leaves other kinds alone when there are deities", async () => {
    Object.assign(mocks.deities, { data: [{ id: "d1", name: "Moradin", titles: null }], isLoading: false });
    mocks.response = { matches: { items: { i1: [{ targetId: "x", source: "library", name: "Moradin", matchKind: "exact", detail: null, distance: null }] } }, semantic: true };
    const { api } = open("row-1", { items: [entity("i1", { name: "Moradin" })] });
    await flushPromises();
    expect(api().candidatesFor("items").get("i1")).toHaveLength(1);
  });
});
