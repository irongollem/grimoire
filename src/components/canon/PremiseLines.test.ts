import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm-1" }) }));

import PremiseLines from "./PremiseLines.vue";
import { useCampaignStore } from "@/stores/campaign";

function mountLines() {
  const pinia = createPinia();
  setActivePinia(pinia);
  useCampaignStore().activeCampaignId = "c1";
  return mount(PremiseLines, {
    props: { title: "Themes", itemLabel: "Theme", placeholder: "…", kinds: ["theme"], entries: [] },
    global: { plugins: [pinia, VueQueryPlugin], stubs: { PremiseLineRow: true } },
  });
}
const boxValue = (w: ReturnType<typeof mountLines>) => (w.find("input").element as HTMLInputElement).value;

describe("PremiseLines add row", () => {
  beforeEach(() => fake.reset());

  it("creates nothing for a blank draft", async () => {
    const w = mountLines();
    await w.find("input").setValue("   ");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(fake.rows("canon_entries")).toEqual([]);
  });

  it("creates the theme as a premise entry of its kind and clears the box on success", async () => {
    const w = mountLines();
    await w.find("input").setValue(" Kindness is courage. ");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(fake.rows("canon_entries")).toMatchObject([{ part: "premise", premise_kind: "theme", title: "Kindness is courage." }]);
    expect(boxValue(w)).toBe("");
  });

  it("keeps the words in the box when the create fails, so the DM can try again", async () => {
    fake.failNext("canon_entries", { message: "boom" });
    const w = mountLines();
    await w.find("input").setValue("Kindness is courage.");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(boxValue(w)).toBe("Kindness is courage.");
    expect(fake.rows("canon_entries")).toEqual([]);
  });
});
