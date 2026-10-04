import { beforeEach, describe, expect, it, vi } from "vitest";

// Every campaign query is recorded rather than sent: what this file protects is
// the shape of the request — the role scope — not PostgREST's behaviour.
const calls: { select: string; filters: [string, unknown][] } = { select: "", filters: [] };
let rows: Record<string, unknown>[] = [];
let currentUser: { id: string } | null = { id: "me" };

/** PostgREST's builder is awaited directly, with no terminal `execute()`, so
 *  the stub is a real promise carrying the chain methods rather than an object
 *  that merely looks like one. */
function queryStub() {
  const chain = Promise.resolve({ data: rows, error: null }) as Promise<unknown> &
    Record<string, (...args: never[]) => unknown>;
  chain.select = (columns: string) => {
    calls.select = columns;
    return chain;
  };
  chain.eq = (column: string, value: unknown) => {
    calls.filters.push([column, value]);
    return chain;
  };
  chain.order = () => chain;
  return chain;
}

vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => queryStub() },
  getCurrentUser: () => currentUser,
}));
vi.mock("@/lib/analytics", () => ({ track: () => {} }));

import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import {
  fetchCampaignsAs,
  useAllDmCampaigns,
  useDmArchivedCampaigns,
  useDmCampaigns,
} from "./useCampaigns";

describe("fetchCampaignsAs", () => {
  beforeEach(() => {
    calls.select = "";
    calls.filters = [];
    rows = [];
    currentUser = { id: "me" };
  });

  it("scopes to the caller's own membership in the asked-for role", async () => {
    await fetchCampaignsAs("dm", false);

    expect(calls.select).toContain("campaign_members!inner");
    expect(calls.filters).toEqual([
      ["campaign_members.user_id", "me"],
      ["campaign_members.role", "dm"],
      ["is_archived", false],
    ]);
  });

  it("asks for the player role without widening to every campaign RLS returns", async () => {
    await fetchCampaignsAs("player", false);

    expect(calls.filters).toContainEqual(["campaign_members.role", "player"]);
  });

  it("leaves is_archived unfiltered when asked for both", async () => {
    await fetchCampaignsAs("dm", null);

    expect(calls.filters.map(([column]) => column)).not.toContain("is_archived");
  });

  it("strips the membership embed, which is a filter and not a field", async () => {
    rows = [{ id: "c1", name: "Vault", campaign_members: [{ user_id: "me", role: "dm" }] }];

    const result = await fetchCampaignsAs("dm", false);

    expect(result).toEqual([{ id: "c1", name: "Vault" }]);
  });

  it("returns nothing rather than an unscoped list when there is no signed-in user", async () => {
    currentUser = null;

    expect(await fetchCampaignsAs("dm", false)).toEqual([]);
    expect(calls.select).toBe("");
  });
});

describe("the DM campaign lists share one request", () => {
  it("serves the active, archived and all views from a single fetch", async () => {
    currentUser = { id: "me" };
    rows = [
      { id: "a", name: "Open", is_archived: false, campaign_members: [] },
      { id: "b", name: "Shelved", is_archived: true, campaign_members: [] },
    ];
    let fetches = 0;
    const original = calls.filters;
    calls.filters = new Proxy(original, {
      get(target, prop, receiver) {
        if (prop === "push") fetches += 1;
        return Reflect.get(target, prop, receiver);
      },
    });
    let views: { active: unknown; archived: unknown; all: unknown } | null = null;
    const Probe = defineComponent({
      setup() {
        const active = useDmCampaigns();
        const archived = useDmArchivedCampaigns();
        const all = useAllDmCampaigns();
        views = { active: active.data, archived: archived.data, all: all.data };
        return () => h("div");
      },
    });
    mount(Probe, {
      global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] },
    });
    await flushPromises();

    // Each fetch records its two role filters (user and role); three fetches would record six.
    expect(fetches).toBe(2);
    const read = (ref: unknown) => (ref as { value: { id: string }[] }).value.map((c) => c.id);
    expect(read(views!.active)).toEqual(["a"]);
    expect(read(views!.archived)).toEqual(["b"]);
    expect(read(views!.all)).toEqual(["a", "b"]);
    calls.filters = original;
  });
});
