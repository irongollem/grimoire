import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm-1" }) }));
vi.mock("@/composables/canon/useKnownToByEntry", () => ({
  useKnowersByEntry: () => ({ byEntry: { value: new Map() }, isLoading: { value: false } }),
}));

import TruthsSection from "./TruthsSection.vue";
import { useCampaignStore } from "@/stores/campaign";

function mountSection() {
  const pinia = createPinia();
  setActivePinia(pinia);
  useCampaignStore().activeCampaignId = "c1";
  return mount(TruthsSection, { props: { truths: [] }, global: { plugins: [pinia, VueQueryPlugin] } });
}

describe("TruthsSection add row", () => {
  beforeEach(() => fake.reset());

  it("makes the truth with the mark the DM chose, never without one (the table refuses a truth with no mark)", async () => {
    const w = mountSection();
    await w.find("input").setValue("The river gives back whatever is thrown in.");
    await w.findAll("button").find((b) => b.text() === "Known to some")!.trigger("click");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(fake.rows("canon_entries")).toMatchObject([
      { part: "truth", knowledge: "some", title: "The river gives back whatever is thrown in.", campaign_id: "c1" },
    ]);
  });

  it("starts on Known to all, so a truth typed and sent at once is a public one and says so", async () => {
    const w = mountSection();
    await w.find("input").setValue("Magic leaves a taste.");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(fake.rows("canon_entries")).toMatchObject([{ knowledge: "all" }]);
  });

  it("adds nothing for a blank sentence", async () => {
    const w = mountSection();
    await w.find("input").setValue("   ");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(fake.rows("canon_entries")).toEqual([]);
  });
});
