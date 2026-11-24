import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { canonEntry } from "@/test/canonEntry";
import type { CanonEntry } from "@/types/canon.types";

const entries = ref<CanonEntry[]>([]);
const forces = ref<{ steps: unknown[]; ticks: Record<string, unknown>[]; quests: unknown[] }>({ steps: [], ticks: [], quests: [] });
const clues = ref<Record<string, unknown>[]>([]);
const quests = ref<Record<string, unknown>[]>([]);
const links = ref<Record<string, unknown>[]>([]);
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCanonEntries: () => ({ data: entries }) }));
vi.mock("@/composables/canon/useCanonForces", () => ({ useCanonForceData: () => ({ data: forces }) }));
vi.mock("@/composables/canon/useCanonClues", () => ({ useCanonClues: () => ({ data: clues }) }));
vi.mock("@/composables/quests/useQuests", () => ({ useQuests: () => ({ data: quests }) }));
vi.mock("@/composables/connections/useConnections", () => ({ useCampaignLinks: () => ({ data: links }) }));

import ArcContents from "./ArcContents.vue";

const RouterLink = { props: ["to"], template: "<a :data-to='JSON.stringify(to)'><slot /></a>" };
const mountIt = (arcId = "a1") => mount(ArcContents, { props: { arcId }, global: { stubs: { RouterLink } } });
const block = (w: ReturnType<typeof mountIt>, name: string) => w.get(`[data-testid=arc-block-${name}]`);

describe("ArcContents", () => {
  beforeEach(() => {
    entries.value = [
      canonEntry({ id: "f1", part: "force", title: "The tide cult", arc_id: "a1", clock_size: 6 }),
      canonEntry({ id: "f2", part: "force", title: "The thieves", arc_id: "a2" }),
      canonEntry({ id: "s1", part: "secret", title: "The god sleeps", arc_id: "a1" }),
      canonEntry({ id: "q1", part: "question", title: "Who rang the bell?", arc_id: "a1" }),
      canonEntry({ id: "q2", part: "question", title: "Settled one", arc_id: "a1", closed_as: "answered" }),
      canonEntry({ id: "b1", part: "backstory", title: "Tansy", arc_id: "a1" }),
    ];
    forces.value = { steps: [], quests: [], ticks: [{ force_id: "f1", delta: 2 }, { force_id: "f2", delta: 5 }] };
    clues.value = [
      { id: "c1", secret_id: "s1", found_at: "2026-11-01T00:00:00Z" },
      { id: "c2", secret_id: "s1", found_at: null },
      { id: "c3", secret_id: "s9", found_at: null },
    ];
    quests.value = [
      { id: "qu1", title: "Into the mill", status: "active", arc_id: "a1" },
      { id: "qu2", title: "The heist", status: "active", arc_id: "a2" },
    ];
    links.value = [{ from_kind: "canon", from_id: "b1", to_kind: "canon", to_id: "q1", type: "related_to" }];
  });

  // Bug caught: listing the campaign's things instead of this arc's, so an arc shows another arc's forces and quests.
  it("lists only what is in this arc, in every block", () => {
    const w = mountIt();
    expect(block(w, "forces").text()).toContain("The tide cult");
    expect(block(w, "forces").text()).not.toContain("The thieves");
    expect(block(w, "quests").text()).toContain("Into the mill");
    expect(block(w, "quests").text()).not.toContain("The heist");
    expect(block(w, "backstories").text()).toContain("Tansy");
    expect(block(w, "backstories").text()).toContain("Who rang the bell?");
    expect(mountIt("a3").text()).toContain("No force is in this arc.");
  });

  // Bug caught: the clock summing every force's ticks, or a secret's tally counting every secret's clues.
  it("tallies a force's clock and a secret's clues from its own rows only", () => {
    const w = mountIt();
    expect(block(w, "forces").text()).toContain("2 of 6");
    expect(block(w, "secrets").text()).toContain("1 of 2 clues found");
  });

  // Bug caught: answered questions listed as open, so an arc looks unfinished.
  it("lists open questions only, and says what a quest's status is", () => {
    const w = mountIt();
    expect(block(w, "questions").text()).toContain("Who rang the bell?");
    expect(block(w, "questions").text()).not.toContain("Settled one");
    expect(block(w, "quests").text()).toContain("Active");
  });

  // Bug caught: a link to a quest opening the canon page.
  it("opens a quest on its own page and an entry in the canon", () => {
    const w = mountIt();
    expect(block(w, "quests").get("a").attributes("data-to")).toBe(JSON.stringify("/quests/qu1"));
    expect(block(w, "forces").get("a").attributes("data-to")).toBe(JSON.stringify({ path: "/canon", query: { entry: "f1" } }));
  });
});
