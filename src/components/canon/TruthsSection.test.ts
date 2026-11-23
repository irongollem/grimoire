import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { canonEntry } from "@/test/canonEntry";
import { useCanonUiStore } from "@/stores/ui/canon";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm-1" }) }));
vi.mock("@/composables/canon/useKnownToByEntry", () => ({
  useKnowersByEntry: () => ({ byEntry: ref(new Map()), isLoading: ref(false) }),
}));

import type { CanonEntry } from "@/types/canon.types";
import TruthsSection from "./TruthsSection.vue";
import { useCampaignStore } from "@/stores/campaign";

function mountSection(props: { truths?: CanonEntry[]; arcLabel?: string | null } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useCampaignStore().activeCampaignId = "c1";
  return mount(TruthsSection, { props: { truths: [], ...props }, global: { plugins: [pinia, VueQueryPlugin] } });
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

describe("TruthsSection find and order (#1255 item 11)", () => {
  beforeEach(() => fake.reset());
  const titles = ["River", "Stain", "Mill", "Guild", "Wound", "Moon"];
  const truths = (n: number) => titles.slice(0, n).map((title, i) => canonEntry({ id: `t${i}`, part: "truth", knowledge: "all", title, sort_order: i }));
  const rowTitles = (w: ReturnType<typeof mountSection>) => w.findAll("[data-testid=truth-ledger] li").map((li) => li.find("button").attributes("aria-label"));

  // Bug caught: the search box shown on a young campaign (clutter) or never shown on a long list.
  it("offers a search only when the part holds more than five truths", () => {
    expect(mountSection({ truths: truths(5) }).find("input[type=search]").exists()).toBe(false);
    expect(mountSection({ truths: truths(6) }).find("input[type=search]").exists()).toBe(true);
  });

  // Bug caught: a query matched against the wrong field or case-sensitively.
  it("narrows the list by title as the DM types, in any case", async () => {
    const w = mountSection({ truths: truths(6) });
    await w.find("input[type=search]").setValue("sTa");
    expect(rowTitles(w)).toEqual(["Stain"]);
  });

  it("keeps the search field while a query is set, even if the list shrinks below six, so it can be cleared", async () => {
    const w = mountSection({ truths: truths(6) });
    await w.find("input[type=search]").setValue("zzz");
    await w.setProps({ truths: truths(3) });
    expect(w.find("input[type=search]").exists()).toBe(true);
  });

  // Bug caught: the DM left with a list that looks empty and no word on why.
  it("says nothing matches rather than showing the 'no truths yet' welcome", async () => {
    const w = mountSection({ truths: truths(6) });
    await w.find("input[type=search]").setValue("zzz");
    expect(w.text()).toContain("No truth matches");
    expect(w.text()).not.toContain("No truths yet");
  });

  it("names the arc once in a quiet line, and its empty state says nothing of this part is in it", () => {
    const w = mountSection({ truths: [], arcLabel: "The drowned god" });
    expect(w.find("[data-testid=arc-note]").text()).toBe("Showing The drowned god only.");
    expect(w.text()).toContain("Nothing of this part is in The drowned god.");
  });

  it("moves a truth up by swapping its place with the one before it", async () => {
    const list = truths(3);
    fake.seed("canon_entries", list as never);
    const w = mountSection({ truths: list });
    await w.find("button[aria-label='Move Mill up']").trigger("click");
    await flushPromises();
    expect(Object.fromEntries(fake.rows("canon_entries").map((r) => [r.id, r.sort_order]))).toEqual({ t0: 0, t1: 2, t2: 1 });
  });

  // Bug caught: moving inside a narrowed list, where "up" means different things on screen and in the canon.
  it("offers no move buttons while a search narrows the list, or an arc does, and the first row's Up is dead", async () => {
    const w = mountSection({ truths: truths(6) });
    expect(w.find("button[aria-label='Move River up']").attributes("disabled")).toBeDefined();
    expect(w.find("[data-testid=move-buttons]").exists()).toBe(true);
    await w.find("input[type=search]").setValue("i"); // River, Stain, Mill, Guild: still four rows, so a move would be possible
    expect(w.find("[data-testid=move-buttons]").exists()).toBe(false);
    useCanonUiStore().partQuery.truths = "";
    await w.vm.$nextTick();
    expect(w.find("[data-testid=move-buttons]").exists()).toBe(true);
    await w.setProps({ arcLabel: "The guild" });
    expect(w.find("[data-testid=move-buttons]").exists()).toBe(false);
  });
});
