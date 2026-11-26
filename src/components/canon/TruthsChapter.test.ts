import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { canonEntry } from "@/test/canonEntry";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
// The chapter reads its deep link (`?fact=`) from the route; each test sets the query it was reached with.
const routeState = vi.hoisted(() => ({ query: {} as Record<string, string> }));
vi.mock("vue-router", async (orig) => ({ ...(await orig<typeof import("vue-router")>()), useRoute: () => routeState }));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm-1" }) }));
const knowers = vi.hoisted(() => ({ value: new Map<string, unknown[]>() }));
vi.mock("@/composables/canon/useKnownToByEntry", async () => {
  const { computed, ref } = await import("vue");
  return { useKnowersByEntry: () => ({ byEntry: computed(() => knowers.value), isLoading: ref(false) }) };
});
const ties = vi.hoisted(() => ({ value: [] as unknown[] }));
vi.mock("@/composables/world/useWorldTies", async () => {
  const { computed } = await import("vue");
  return { useWorldTies: () => ({ data: computed(() => ties.value) }) };
});

const tableFacts = vi.hoisted(() => ({ value: [] as unknown[] }));
vi.mock("@/composables/canon/useTableFacts", async () => {
  const { computed } = await import("vue");
  return { useTableFacts: () => ({ facts: { data: computed(() => tableFacts.value) } }) };
});
vi.mock("@/composables/ask/useCanAsk", async () => {
  const { ref } = await import("vue");
  const can = ref(true);
  return { useCanAsk: () => can };
});

import type { CanonEntry } from "@/types/canon.types";
import { useCanonUiStore } from "@/stores/ui/canon";
import TruthsChapter from "./TruthsChapter.vue";
import { useCampaignStore } from "@/stores/campaign";
import { useAskUiStore } from "@/stores/ui/ask";

// TruthDetail and the table's review are other files' business here: they are stubbed to what this chapter hands them.
const TruthDetailStub = { name: "TruthDetail", props: ["entry"], emits: ["close", "delete"], template: "<div data-testid='detail'><button data-testid='detail-close' @click=\"$emit('close')\" /><button data-testid='detail-delete' @click=\"$emit('delete')\" /></div>" };
const TableAddedStub = { name: "TableAddedSection", props: ["truths", "focusFact"], template: "<div data-testid='table-added' />" };

function mountSection(props: { truths?: CanonEntry[]; allTruths?: CanonEntry[]; selected?: CanonEntry | null; arcLabel?: string | null } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  useCampaignStore().activeCampaignId = "c1";
  const truths = props.truths ?? [];
  return mount(TruthsChapter, {
    attachTo: document.body,
    props: { allTruths: truths, ...props, truths },
    global: { plugins: [pinia, VueQueryPlugin], stubs: { CanonReview: true, TruthDetail: TruthDetailStub, TableAddedSection: TableAddedStub } },
  });
}

describe("TruthsChapter add row", () => {
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

describe("TruthsChapter filter, group and order (#1255 item 11, #1258 item 22)", () => {
  beforeEach(() => {
    fake.reset();
    ties.value = [];
    tableFacts.value = [];
  });
  const marks = ["all", "some", "secret", "all", "some", "secret"] as const;
  const titles = ["River", "Stain", "Mill", "Guild", "Wound", "Moon"];
  const truths = (n = 6) => titles.slice(0, n).map((title, i) => canonEntry({ id: `t${i}`, part: "truth", knowledge: marks[i], title, sort_order: i, arc_id: i === 0 ? "a1" : null }));
  const rowTitles = (w: ReturnType<typeof mountSection>) => w.findAll("[data-testid=truth-ledger] li").map((li) => li.find("button").attributes("aria-label"));
  const pick = (w: ReturnType<typeof mountSection>, label: string) => w.findAll("button").find((b) => b.text() === label)!.trigger("click");

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

  // Bug caught: "Move to top" behaving as a one-step move, or writing the rows it passed over wrongly.
  it("takes a truth to the top or the bottom in one click, renumbering the rest", async () => {
    const list = truths(4);
    fake.seed("canon_entries", list as never);
    const w = mountSection({ truths: list });
    await w.find("button[aria-label='Move Guild to the top']").trigger("click");
    await flushPromises();
    expect(Object.fromEntries(fake.rows("canon_entries").map((r) => [r.id, r.sort_order]))).toEqual({ t3: 0, t0: 1, t1: 2, t2: 3 });
  });

  it("takes a truth to the bottom, shifting the ones below it up", async () => {
    const list = truths(4);
    fake.seed("canon_entries", list as never);
    const w = mountSection({ truths: list });
    await w.find("button[aria-label='Move River to the bottom']").trigger("click");
    await flushPromises();
    expect(Object.fromEntries(fake.rows("canon_entries").map((r) => [r.id, r.sort_order]))).toEqual({ t1: 0, t2: 1, t3: 2, t0: 3 });
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

  // Bug caught: the chapter keeping its own AI fold, so the Canon had a second assistant beside the Familiar.
  it("has no AI panel of its own, and an empty chapter offers the Familiar with a written request", async () => {
    const w = mountSection({ truths: [] });
    expect(w.find("[data-testid=canon-suggest-fold]").exists()).toBe(false);
    await w.get("[data-testid=canon-suggest]").trigger("click");
    expect(useAskUiStore().prefill).toBe("Suggest three truths for my canon.");
  });

  it("names the arc once in a quiet line, and its empty state says nothing of this part is in it", () => {
    const w = mountSection({ truths: [], arcLabel: "The drowned god" });
    expect(w.find("[data-testid=arc-note]").text()).toBe("Showing The drowned god only.");
    expect(w.text()).toContain("Nothing of this chapter is in The drowned god.");
  });
});

describe("TruthsChapter row: who knows it", () => {
  beforeEach(() => {
    fake.reset();
    knowers.value = new Map();
  });
  const truth = (knowledge: CanonEntry["knowledge"]) => [canonEntry({ id: "t1", part: "truth", knowledge, title: "The Stain is a wound." })];
  const ferrymen = { rowId: "k", kind: "faction", id: "f1", name: "The Ferrymen" };

  // Bug caught: a 'some' truth with no knowers looking finished, so the gap (nobody can know it) is invisible in the list.
  it("says nobody is named for a 'some' truth with no knowers, and names them when there are some", () => {
    expect(mountSection({ truths: truth("some") }).find("[data-testid=nobody-named]").exists()).toBe(true);
    knowers.value = new Map([["t1", [ferrymen]]]);
    const w = mountSection({ truths: truth("some") });
    expect(w.text()).toContain("The Ferrymen");
    expect(w.find("[data-testid=nobody-named]").exists()).toBe(false);
  });

  // Bug caught: knowers listed under a truth everyone knows, whatever the list handed the row.
  it("lists no knowers for a truth known to all, and states a secret's mark in words", () => {
    knowers.value = new Map([["t1", [ferrymen]]]);
    expect(mountSection({ truths: truth("all") }).text()).not.toContain("The Ferrymen");
    expect(mountSection({ truths: truth("secret") }).text()).toContain("Known to no one");
  });
});

describe("TruthsChapter open entry and the table's inbox", () => {
  beforeEach(() => {
    fake.reset();
    ties.value = [];
    tableFacts.value = [];
    routeState.query = {};
  });
  const list = [canonEntry({ id: "t0", part: "truth", knowledge: "all", title: "River", sort_order: 0 })];
  const fact = (id: string, over: Record<string, unknown> = {}) => ({ id, source: "table", supersedes_id: null, kept_at: null, struck_at: null, created_at: `2026-11-20T10:00:0${id}Z`, ...over });

  // Bug caught: selecting a truth that opens nowhere, or the selected row not marked, so the DM cannot tell which truth the pane shows.
  it("opens the selected truth in the chapter's entry, marks its row, and passes close and delete up", async () => {
    const w = mountSection({ truths: list, selected: list[0] });
    expect(w.find("[data-testid=canon-chapter-entry] [data-testid=detail]").exists()).toBe(true);
    expect(w.get("#canon-entry-t0").attributes("data-selected")).toBe("true");
    await w.get("[data-testid=detail-close]").trigger("click");
    await w.get("[data-testid=detail-delete]").trigger("click");
    expect(w.emitted("close")).toHaveLength(1);
    expect(w.emitted("delete")).toHaveLength(1);
    await w.get("#canon-entry-t0 button").trigger("click");
    expect(w.emitted("select")).toEqual([["t0"]]);
  });

  // Bug caught: the inbox counting kept, struck and corrected lines, so the badge never reached zero, or showing at zero.
  it("shows the inbox with the lines still to review, and nothing when there are none", () => {
    tableFacts.value = [fact("1"), fact("2", { kept_at: "2026-11-20T11:00:00Z" }), fact("3", { struck_at: "2026-11-20T11:00:00Z" }), fact("4")];
    expect(mountSection({ truths: list }).get("[data-testid=table-inbox]").text()).toContain("2 lines from the table to keep or strike");
    tableFacts.value = [fact("1", { kept_at: "2026-11-20T11:00:00Z" })];
    expect(mountSection({ truths: list }).find("[data-testid=table-inbox]").exists()).toBe(false);
  });

  // Bug caught: Review doing nothing, or the review drawn on the page again (a second place to read the table's lines).
  it("opens the review in a modal, with every truth of the campaign, not only the arc's", async () => {
    tableFacts.value = [fact("1")];
    const all = [...list, canonEntry({ id: "t9", part: "truth", knowledge: "all", title: "Other arc", arc_id: "a2" })];
    const w = mountSection({ truths: list, allTruths: all });
    expect(document.querySelector("[data-testid=table-added]")).toBeNull();
    await w.get("[data-testid=table-review]").trigger("click");
    expect(document.querySelector("[data-testid=table-added]")).not.toBeNull();
    expect(w.getComponent(TableAddedStub).props("truths")).toHaveLength(2);
  });

  // Bug caught: a search hit for a table line (`?fact=`) landing on the Truths chapter with the review closed; an id that is no line must open nothing.
  it("opens the review on the line a search link names, and nothing for an unknown id", async () => {
    tableFacts.value = [fact("1")];
    routeState.query = { fact: "1" };
    const w = mountSection({ truths: list });
    await flushPromises();
    expect(w.getComponent(TableAddedStub).props("focusFact")).toBe("1");
    w.unmount();
    document.body.innerHTML = "";
    routeState.query = { fact: "ghost" };
    mountSection({ truths: list });
    await flushPromises();
    expect(document.querySelector("[data-testid=table-added]")).toBeNull();
  });

  // Bug caught: a truth added under a narrowing arc taking the arc's count as its place, landing in the middle of the whole list.
  it("places a new truth after every truth of the campaign, whatever arc narrows the list", async () => {
    const all = [...list, canonEntry({ id: "t9", part: "truth", knowledge: "all", title: "Other", sort_order: 1 })];
    const w = mountSection({ truths: list, allTruths: all });
    await w.find("input").setValue("A third.");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(fake.rows("canon_entries")).toMatchObject([{ title: "A third.", sort_order: 2 }]);
  });

  // Bug caught (#1279 item 5): a truth added under an arc filter was made in no arc and vanished from the narrowed list.
  it("makes a new truth in the arc the page is narrowed to", async () => {
    const w = mountSection({ truths: list, allTruths: list, arcLabel: "The guild" });
    useCanonUiStore().arcFilter = "a1";
    await w.find("input").setValue("A third.");
    await w.find("form").trigger("submit");
    await flushPromises();
    expect(fake.rows("canon_entries")).toMatchObject([{ title: "A third.", arc_id: "a1" }]);
  });
});

describe("TruthsChapter select and bulk actions (#1279 item 33)", () => {
  beforeEach(() => {
    fake.reset();
    ties.value = [];
    tableFacts.value = [];
  });
  const list = () => [
    canonEntry({ id: "t0", part: "truth", knowledge: "all", title: "River", sort_order: 0, arc_id: null }),
    canonEntry({ id: "t1", part: "truth", knowledge: "all", title: "Stain", sort_order: 1, arc_id: null }),
    canonEntry({ id: "t2", part: "truth", knowledge: "secret", title: "Mill", sort_order: 2, arc_id: null }),
  ];
  const startSelecting = async (w: ReturnType<typeof mountSection>) => w.get("[data-testid=truth-select-toggle]").trigger("click");
  const tick = (w: ReturnType<typeof mountSection>, label: string) => w.get(`button[aria-label='${label}']`).trigger("click");
  const field = (id: string, key: string) => fake.rows("canon_entries").find((r) => r.id === id)?.[key];

  // Bug caught: a tap on a row in selection mode opening the sheet instead of selecting it.
  it("a row selects instead of opening while selecting, and the bar counts them", async () => {
    const w = mountSection({ truths: list() });
    await startSelecting(w);
    await tick(w, "River");
    await tick(w, "Mill");
    expect(w.emitted("select")).toBeUndefined();
    expect(w.get("[data-testid=bulk-count]").text()).toBe("2 selected");
    expect(w.find("[data-testid=move-buttons]").exists()).toBe(false);
  });

  // Bug caught: "File in arc" writing every truth on screen rather than the ticked ones, or the wrong arc.
  it("files only the selected truths in the chosen arc", async () => {
    const l = list();
    fake.seed("canon_entries", l as never);
    fake.seed("canon_arcs", [{ id: "a1", campaign_id: "c1", name: "The Long Winter", sort_order: 0 }] as never);
    const w = mountSection({ truths: l });
    await startSelecting(w);
    await tick(w, "River");
    await tick(w, "Stain");
    await flushPromises();
    await w.get("[data-testid=bulk-arc]").setValue("a1");
    await flushPromises();
    expect([field("t0", "arc_id"), field("t1", "arc_id"), field("t2", "arc_id")]).toEqual(["a1", "a1", null]);
  });

  // Bug caught: re-marking to "some" wiping the people already named as knowing it (it must change the mark alone).
  it("marks the selected truths and touches only their mark", async () => {
    const l = list();
    fake.seed("canon_entries", l as never);
    const w = mountSection({ truths: l });
    await startSelecting(w);
    await tick(w, "Mill");
    await w.get("[data-testid=bulk-mark]").setValue("some");
    await flushPromises();
    expect(field("t2", "knowledge")).toBe("some");
    expect(field("t0", "knowledge")).toBe("all");
    expect(fake.rows("canon_known_to" as never)).toEqual([]);
  });

  // Bug caught: a truth hidden by a filter after being ticked still reaching the write.
  it("never writes a ticked truth the mark filter has since hidden", async () => {
    const l = list();
    fake.seed("canon_entries", l as never);
    const w = mountSection({ truths: l });
    await startSelecting(w);
    await tick(w, "River");
    await tick(w, "Mill");
    await w.findAll("button").find((b) => b.text() === "Secret")!.trigger("click");
    await flushPromises();
    expect(w.get("[data-testid=bulk-count]").text()).toBe("1 selected");
    await w.get("[data-testid=bulk-mark]").setValue("all");
    await flushPromises();
    expect(field("t0", "knowledge")).toBe("all");
    expect(field("t2", "knowledge")).toBe("all");
    expect(field("t1", "knowledge")).toBe("all");
  });
});
