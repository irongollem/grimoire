import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const mocks = vi.hoisted(() => ({
  invokeCalls: [] as { fn: string; body: unknown }[],
  response: { matches: {}, semantic: true } as unknown,
  error: null as Error | null,
}));

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

function entity(ref: string, data: Record<string, unknown>): UsableEntity {
  return { ref, page: 1, confidence: "complete", data };
}

function open(importRowId: string | null, entitiesByKind: Parameters<typeof useImportEntityMatches>[1]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

  it("surfaces an edge function error rather than silently returning empty candidates", async () => {
    mocks.error = new Error("rate_limited");
    const { api } = open("row-1", { npcs: [entity("n1", { name: "Goblin" })] });
    await flushPromises();

    expect(api().error.value).toBeTruthy();
    expect(api().candidatesFor("npcs").size).toBe(0);
  });
});
