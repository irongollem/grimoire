import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ isOwner: true, activeCampaignId: "c1" }) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: { value: [{ id: "a" }] } }) }));

import { npcBlockedCaption, useNpcBookRule } from "@/composables/openBook/useNpcBookRule";

describe("npcBlockedCaption", () => {
  it("only a hidden name gets its own caption; a missing party leaves the whole-party caption to the control", () => {
    expect(npcBlockedCaption("name")).toMatch(/name/i);
    expect(npcBlockedCaption("party")).toBeNull();
    expect(npcBlockedCaption(null)).toBeNull();
  });
});

describe("useNpcBookRule reads", () => {
  function run() {
    mount(defineComponent({ setup() { useNpcBookRule(); return () => null; } }), {
      global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] },
    });
  }
  const reads = (table: string) => fake.calls.filter((c) => c.target === table && c.op === "select");

  beforeEach(() => fake.reset());

  it("reads no places for a campaign without a book, where the rule cannot matter", async () => {
    run();
    await flushPromises();
    expect(reads("open_books")).toHaveLength(1);
    expect(reads("locations")).toHaveLength(0);
  });

  it("reads the places once the campaign has a book", async () => {
    fake.seed("open_books", [{ campaign_id: "c1", include_shared: false }]);
    run();
    await flushPromises();
    expect(reads("locations")).toHaveLength(1);
  });
});
