import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { canonEntry } from "@/test/canonEntry";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm-1" }) }));
vi.mock("@/composables/canon/useKnownToByEntry", () => ({
  useKnowersByEntry: () => ({ byEntry: ref(new Map()), isLoading: ref(false) }),
}));
const ties = vi.hoisted(() => ({ value: [] as unknown[] }));
vi.mock("@/composables/world/useWorldTies", async () => {
  const { computed } = await import("vue");
  return { useWorldTies: () => ({ data: computed(() => ties.value) }) };
});

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

describe("TruthsSection filter, group and order (#1255 item 11, #1258 item 22)", () => {
  beforeEach(() => {
    fake.reset();
    ties.value = [];
  });
  const marks = ["all", "some", "secret", "all", "some", "secret"] as const;
  const titles = ["River", "Stain", "Mill", "Guild", "Wound", "Moon"];
  const truths = (n = 6) => titles.slice(0, n).map((title, i) => canonEntry({ id: `t${i}`, part: "truth", knowledge: marks[i], title, sort_order: i, arc_id: i === 0 ? "a1" : null }));
  const rowTitles = (w: ReturnType<typeof mountSection>) => w.findAll("[data-testid=truth-ledger] li").map((li) => li.find("button").attributes("aria-label"));
  const pick = (w: ReturnType<typeof mountSection>, label: string) => w.findAll("button").find((b) => b.text() === label)!.trigger("click");

  // Bug caught: the per-part search left in place after the page got its one search.
  it("has no search field of its own", () => {
    expect(mountSection({ truths: truths() }).find("input[type=search]").exists()).toBe(false);
  });

  // Bug caught: a mark filter that narrows on the wrong field, or a No arc that reads as "not this arc".
  it("filters by mark, and to the truths of no arc", async () => {
    const w = mountSection({ truths: truths() });
    await pick(w, "Secret");
    expect(rowTitles(w)).toEqual(["Mill", "Moon"]);
    await pick(w, "Some");
    expect(rowTitles(w)).toEqual(["Stain", "Wound"]);
    await pick(w, "No arc");
    expect(rowTitles(w)).toEqual(["Stain", "Mill", "Guild", "Wound", "Moon"]);
    await pick(w, "All");
    expect(rowTitles(w)).toHaveLength(6);
  });

  // Bug caught: the DM left with a list that looks empty and no word on why, or the welcome shown over a filter.
  it("says no truth has the mark rather than showing the 'no truths yet' welcome, and Clear brings them back", async () => {
    const w = mountSection({ truths: truths(1) });
    await pick(w, "Secret");
    expect(w.text()).toContain("No truth matches");
    expect(w.text()).not.toContain("No truths yet");
    await w.get("[data-testid=truth-clear]").trigger("click");
    expect(rowTitles(w)).toEqual(["River"]);
    expect(w.find("[data-testid=truth-clear]").exists()).toBe(false);
  });

  // Bug caught: grouping that lists a truth under the record it merely knows of, or drops the truths about no one.
  it("groups by what each truth is about, the rest last under their own heading", async () => {
    ties.value = [
      { source: "link", type: "about", from_kind: "canon", from_id: "t1", to_kind: "npc", to_id: "n1", to_name: "Sift" },
      { source: "link", type: "known_to", from_kind: "canon", from_id: "t0", to_kind: "npc", to_id: "n1", to_name: "Sift" },
    ];
    const w = mountSection({ truths: truths(3) });
    await pick(w, "Group by what it is about");
    const groups = w.findAll("[data-testid=truth-group]").map((g) => [g.get("h3").text(), g.findAll("li").length]);
    expect(groups).toEqual([["Sift", 1], ["Not about anyone in particular", 2]]);
  });

  it("moves a truth up by swapping its place with the one before it", async () => {
    const list = truths(3);
    fake.seed("canon_entries", list as never);
    const w = mountSection({ truths: list });
    await w.find("button[aria-label='Move Mill up']").trigger("click");
    await flushPromises();
    expect(Object.fromEntries(fake.rows("canon_entries").map((r) => [r.id, r.sort_order]))).toEqual({ t0: 0, t1: 2, t2: 1 });
  });

  // Bug caught: moving inside a filtered, grouped or arc-narrowed list, where "up" means different things on screen and in the canon.
  it("offers no move buttons while a mark filter, grouping or an arc narrows the list, and the first row's Up is dead", async () => {
    const w = mountSection({ truths: truths() });
    expect(w.find("button[aria-label='Move River up']").attributes("disabled")).toBeDefined();
    expect(w.find("[data-testid=move-buttons]").exists()).toBe(true);
    await pick(w, "Known to all"); // River and Guild: still two rows, so a move would be possible
    expect(w.find("[data-testid=move-buttons]").exists()).toBe(false);
    await pick(w, "All");
    expect(w.find("[data-testid=move-buttons]").exists()).toBe(true);
    await pick(w, "Group by what it is about");
    expect(w.find("[data-testid=move-buttons]").exists()).toBe(false);
    await pick(w, "Group by what it is about");
    await w.setProps({ arcLabel: "The guild" });
    expect(w.find("[data-testid=move-buttons]").exists()).toBe(false);
  });

  // Bug caught (#1258 item 19): the truths helper left open on the page, above the ledger on every visit.
  it("keeps the helper inside the Suggest fold", () => {
    const w = mountSection({ truths: truths(1) });
    expect(w.getComponent({ name: "CanonSuggestFold" }).props("part")).toBe("truths");
  });

  it("names the arc once in a quiet line, and its empty state says nothing of this part is in it", () => {
    const w = mountSection({ truths: [], arcLabel: "The drowned god" });
    expect(w.find("[data-testid=arc-note]").text()).toBe("Showing The drowned god only.");
    expect(w.text()).toContain("Nothing of this part is in The drowned god.");
  });
});
