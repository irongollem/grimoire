import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { canonEntry } from "@/test/canonEntry";
import type { CanonEntry } from "@/types/canon.types";

const read = <T>(data: T) => ({ data: ref(data), isLoading: ref(false), isError: ref(false) });
const arcs = read<Record<string, unknown>[]>([]);
const entries = read<CanonEntry[]>([]);
const forces = read<{ steps: unknown[]; ticks: Record<string, unknown>[]; quests: unknown[] }>({ steps: [], ticks: [], quests: [] });
const clues = read<Record<string, unknown>[]>([]);
const quests = read<Record<string, unknown>[]>([]);
const links = read<Record<string, unknown>[]>([]);
const route = { params: { id: "a1" } as Record<string, string> };

vi.mock("vue-router", async (orig) => ({ ...(await orig<typeof import("vue-router")>()), useRoute: () => route }));
vi.mock("@/composables/canon/useCanonArcs", () => ({ useCanonArcs: () => arcs }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCanonEntries: () => entries }));
vi.mock("@/composables/canon/useCanonForces", () => ({ useCanonForceData: () => forces }));
vi.mock("@/composables/canon/useCanonClues", () => ({ useCanonClues: () => clues }));
vi.mock("@/composables/quests/useQuests", () => ({ useQuests: () => quests }));
vi.mock("@/composables/connections/useConnections", () => ({ useCampaignLinks: () => links }));

import ArcView from "./ArcView.vue";

const stubs = {
  PageHeader: { props: ["title"], template: "<div><h1>{{ title }}</h1><slot name='actions' /><slot /></div>" },
  AppButton: { props: ["to", "label"], template: "<a data-testid='btn' :href='to'>{{ label }}</a>" },
  EmptyState: { props: ["title"], template: "<div data-testid='empty'>{{ title }}</div>" },
  ListSkeleton: { template: "<div data-testid='skeleton' />" },
  RouterLink: { props: ["to"], template: "<a :data-to='JSON.stringify(to)'><slot /></a>" },
};
const mountView = () => mount(ArcView, { global: { stubs } });
const block = (w: ReturnType<typeof mountView>, name: string) => w.get(`[data-testid=arc-block-${name}]`);

describe("ArcView", () => {
  beforeEach(() => {
    route.params.id = "a1";
    arcs.data.value = [
      { id: "a1", name: "The drowned god", summary: null, status: "ended", question: "Who woke it?", stakes: "The harbour", ending: "It slept again.", theme_id: "t1" },
      { id: "a2", name: "The guild", summary: null, status: "running", question: "Elsewhere question", stakes: null, ending: null, theme_id: null },
    ];
    entries.data.value = [
      canonEntry({ id: "t1", part: "premise", premise_kind: "theme", title: "Debts are owed" }),
      canonEntry({ id: "f1", part: "force", title: "The tide cult", arc_id: "a1", clock_size: 6 }),
      canonEntry({ id: "f2", part: "force", title: "The thieves", arc_id: "a2" }),
      canonEntry({ id: "s1", part: "secret", title: "The god sleeps", arc_id: "a1" }),
      canonEntry({ id: "s2", part: "secret", title: "The vault key", arc_id: "a2" }),
      canonEntry({ id: "q1", part: "question", title: "Who rang the bell?", arc_id: "a1" }),
      canonEntry({ id: "q2", part: "question", title: "Settled one", arc_id: "a1", closed_as: "answered" }),
      canonEntry({ id: "q3", part: "question", title: "Other arc question", arc_id: "a2" }),
      canonEntry({ id: "b1", part: "backstory", title: "Tansy", arc_id: "a1" }),
    ];
    forces.data.value = { steps: [], quests: [], ticks: [{ force_id: "f1", delta: 2 }, { force_id: "f2", delta: 5 }] };
    clues.data.value = [
      { id: "c1", secret_id: "s1", found_at: "2026-11-01T00:00:00Z" },
      { id: "c2", secret_id: "s1", found_at: null },
      { id: "c3", secret_id: "s2", found_at: null },
    ];
    quests.data.value = [
      { id: "qu1", title: "Into the mill", status: "active", arc_id: "a1" },
      { id: "qu2", title: "The heist", status: "active", arc_id: "a2" },
      { id: "qu3", title: "Loose quest", status: "completed", arc_id: null },
    ];
    links.data.value = [{ from_kind: "canon", from_id: "b1", to_kind: "canon", to_id: "q1", type: "related_to" }];
    arcs.isLoading.value = false;
  });

  // Bug caught: the view listing the campaign's things instead of this arc's, so an arc page shows another arc's forces.
  it("lists only what is in this arc, in every block", () => {
    const w = mountView();
    expect(block(w, "forces").text()).toContain("The tide cult");
    expect(block(w, "forces").text()).not.toContain("The thieves");
    expect(block(w, "secrets").text()).toContain("The god sleeps");
    expect(block(w, "secrets").text()).not.toContain("The vault key");
    expect(block(w, "quests").text()).toContain("Into the mill");
    expect(block(w, "quests").text()).not.toContain("The heist");
    expect(block(w, "quests").text()).not.toContain("Loose quest");
    expect(block(w, "backstories").text()).toContain("Tansy");
    expect(block(w, "backstories").text()).toContain("Who rang the bell?");
  });

  // Bug caught: the clock summing every force's ticks, or a secret's tally counting every secret's clues.
  it("tallies a force's clock and a secret's clues from its own rows only", () => {
    const w = mountView();
    expect(block(w, "forces").text()).toContain("2 of 6");
    expect(block(w, "secrets").text()).toContain("1 of 2 clues found");
  });

  // Bug caught: answered questions listed as open, so an arc looks unfinished.
  it("lists open questions only, and says what a quest's status is", () => {
    const w = mountView();
    expect(block(w, "questions").text()).toContain("Who rang the bell?");
    expect(block(w, "questions").text()).not.toContain("Settled one");
    expect(block(w, "quests").text()).toContain("Active");
  });

  it("shows the question, stakes, theme and ending, linking the theme to its entry", () => {
    const w = mountView();
    expect(w.get("[data-testid=arc-question]").text()).toContain("Who woke it?");
    expect(w.get("[data-testid=arc-stakes]").text()).toContain("The harbour");
    expect(w.get("[data-testid=arc-theme] a").attributes("data-to")).toBe(JSON.stringify({ path: "/canon", query: { entry: "t1" } }));
    expect(w.get("[data-testid=arc-ending]").text()).toContain("It slept again.");
  });

  // Bug caught: a stale ending shown on an arc that is running again.
  it("shows no ending unless the arc has ended", () => {
    route.params.id = "a2";
    expect(mountView().find("[data-testid=arc-ending]").exists()).toBe(false);
  });

  it("says plainly when the arc is gone, with a way back", () => {
    route.params.id = "nope";
    const w = mountView();
    expect(w.get("[data-testid=empty]").text()).toContain("gone");
  });

  // Bug caught: a link to a quest opening the canon page.
  it("opens a quest on its own page", () => {
    const w = mountView();
    expect(block(w, "quests").get("a").attributes("data-to")).toBe(JSON.stringify("/quests/qu1"));
  });
});
