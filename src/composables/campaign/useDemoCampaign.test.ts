import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import {
  isDemoOutdated,
  isDemoStatus,
  useDemoStatus,
  useLoadDemoCampaign,
  usePublishDemoVersion,
  useResetDemoCampaign,
  useSetDemoOffered,
  type DemoStatus,
} from "./useDemoCampaign";

function status(patch: Partial<DemoStatus> = {}): DemoStatus {
  return {
    published: true,
    version: "2026-09-25T00:00:00Z",
    demo_campaign_id: "campaign-1",
    loaded_version: "2026-09-25T00:00:00Z",
    offered: true,
    template_name: null,
    ...patch,
  };
}

describe("isDemoStatus", () => {
  it("accepts what get_demo_status returns", () => {
    expect(isDemoStatus(status())).toBe(true);
    expect(
      isDemoStatus(
        status({ published: false, version: null, demo_campaign_id: null, loaded_version: null, offered: false }),
      ),
    ).toBe(true);
  });

  it("accepts an admin's view, with a template name and offered independent of published", () => {
    expect(isDemoStatus(status({ offered: false, template_name: "Sugarwell" }))).toBe(true);
  });

  it("rejects anything else rather than guessing", () => {
    expect(isDemoStatus(null)).toBe(false);
    expect(isDemoStatus("published")).toBe(false);
    expect(isDemoStatus({ ...status(), published: "yes" })).toBe(false);
    expect(isDemoStatus({ ...status(), version: 3 })).toBe(false);
    expect(isDemoStatus({ ...status(), offered: "yes" })).toBe(false);
    expect(isDemoStatus({ ...status(), template_name: 3 })).toBe(false);
  });
});

describe("isDemoOutdated", () => {
  it("is false for a copy of the current version", () => {
    expect(isDemoOutdated(status())).toBe(false);
  });

  it("is true once the template has been republished", () => {
    expect(isDemoOutdated(status({ version: "2026-10-01T00:00:00Z" }))).toBe(true);
  });

  // Nothing to be out of date with: no copy, or no demo published any more.
  it("is false without a copy or without a published demo", () => {
    expect(isDemoOutdated(status({ loaded_version: null, demo_campaign_id: null }))).toBe(false);
    expect(isDemoOutdated(status({ published: false, version: null }))).toBe(false);
  });
});

describe("the demo campaign over the database", () => {
  let queryClient: QueryClient;
  function run<T>(setup: () => T): T {
    let out!: T;
    mount(
      defineComponent({ setup() { out = setup(); return () => null; } }),
      { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
    );
    return out;
  }

  beforeEach(() => {
    fake.reset();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    fake.seed("campaigns", [
      { id: "fresh-copy", name: "The Demo" },
      { id: "replaced-copy", name: "The Demo (again)" },
      { id: "someone-elses", name: "Not it" },
    ]);
  });

  it("refuses a status of the wrong shape rather than guessing", async () => {
    fake.onRpc("get_demo_status", () => ({ published: "yes" }));
    const status = run(() => useDemoStatus());
    await flushPromises();
    expect(status.error.value?.message).toContain("unexpected shape");
  });

  it("loading the demo makes a copy beside any existing one and returns the campaign the server named", async () => {
    fake.onRpc("load_demo_campaign", (args) => (args.p_replace ? "replaced-copy" : "fresh-copy"));
    const loaded = await run(() => useLoadDemoCampaign()).mutateAsync();
    expect(loaded).toMatchObject({ id: "fresh-copy" });
  });

  it("resetting replaces the existing copy, and refreshes every entity list since the old ones are gone", async () => {
    fake.onRpc("load_demo_campaign", (args) => (args.p_replace ? "replaced-copy" : "fresh-copy"));
    queryClient.setQueryData(["npcs"], []);
    const reset = run(() => useResetDemoCampaign());
    expect(await reset.mutateAsync()).toMatchObject({ id: "replaced-copy" });
    expect(queryClient.getQueryState(["npcs"])?.isInvalidated).toBe(true);
  });

  it("loading refreshes the campaign lists but not the whole app", async () => {
    fake.onRpc("load_demo_campaign", () => "fresh-copy");
    queryClient.setQueryData(["npcs"], []);
    queryClient.setQueryData(["campaigns", "as", "dm"], []);
    await run(() => useLoadDemoCampaign()).mutateAsync();
    expect(queryClient.getQueryState(["campaigns", "as", "dm"])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["npcs"])?.isInvalidated).toBe(false);
  });

  it("fails if the server names no campaign, or one the caller cannot read", async () => {
    fake.onRpc("load_demo_campaign", () => null);
    await expect(run(() => useLoadDemoCampaign()).mutateAsync()).rejects.toThrow("no campaign id");
    fake.onRpc("load_demo_campaign", () => "missing");
    await expect(run(() => useLoadDemoCampaign()).mutateAsync()).rejects.toMatchObject({ code: "PGRST116" });
  });

  it("returns what the server answers for publishing and for offering, and refuses an answer of the wrong type", async () => {
    fake.onRpc("publish_demo_version", () => "2026-10-01T00:00:00Z");
    expect(await run(() => usePublishDemoVersion()).mutateAsync("c1")).toBe("2026-10-01T00:00:00Z");
    fake.onRpc("set_demo_offered", (args) => args.p_offered);
    expect(await run(() => useSetDemoOffered()).mutateAsync(false)).toBe(false);
    fake.onRpc("set_demo_offered", () => "yes");
    await expect(run(() => useSetDemoOffered()).mutateAsync(true)).rejects.toThrow("unexpected result");
    fake.onRpc("publish_demo_version", () => 3);
    await expect(run(() => usePublishDemoVersion()).mutateAsync("c1")).rejects.toThrow("no version");
  });
});
