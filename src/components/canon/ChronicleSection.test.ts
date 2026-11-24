import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { computed, ref } from "vue";
import type { ChronicleItem } from "@/lib/canon/canonChronicle";
import type { Note } from "@/types/notes.types";
import type { CampaignSession } from "@/types/session.types";

const items = ref<ChronicleItem[]>([]);
vi.mock("@/composables/canon/useChronicle", () => ({ useChronicle: () => ({ items, isLoading: computed(() => false), isError: computed(() => false), written: computed(() => 0) }) }));
const canonBySession = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock("@/composables/canon/useSessionCanon", () => ({
  useSessionCanon: () => ({ value: (session: { id: string }) => canonBySession.current[session.id] ?? { groups: [], total: 0 } }),
}));
vi.mock("@/composables/calendar/useCampaignCalendarEvents", () => ({ useCampaignCalendarEvents: () => ({ data: ref([]) }) }));
vi.mock("@/composables/canon/useCanonForces", () => ({ useCanonForceData: () => ({ data: ref({ ticks: [], steps: [], quests: [] }) }) }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: ref([{ id: "m1", name: "Wren" }, { id: "m2", name: "Brakka" }]) }) }));
vi.mock("@/composables/sessions/useSessionLearned", () => ({ useSessionLearned: () => ({ entries: ref([]) }) }));
vi.mock("@/composables/useLowArt", () => ({ useLowArt: () => ({ lowArt: ref(true) }) }));
vi.mock("@/stores/calendar", () => ({ useCalendarStore: () => ({ adapter: { formatDate: (y: number) => `year ${y}` } }) }));
vi.mock("vue-router", () => ({ RouterLink: { props: ["to"], template: "<a><slot /></a>" } }));

import { useCanonUiStore } from "@/stores/ui/canon";
import ChronicleSection from "./ChronicleSection.vue";

const session = (id: string, over: Partial<CampaignSession> = {}): CampaignSession => ({
  id, campaign_id: "c1", user_id: "u", number: null, title: null, played_on: "2026-11-01", started_at: null, ended_at: null,
  created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z", ...over,
});
const note = (over: Partial<Note> = {}): Note => ({
  id: "n1", user_id: "u", campaign_id: "c1", title: "Into the Mere", content: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "The party followed the lanterns." }] }] }),
  tags: [], session_id: "s1", is_pinned: false, player_visible_to: [], session_start_year: 512, session_start_month: 3, session_start_day: 3,
  session_end_year: null, session_end_month: null, session_end_day: null, session_real_date: null, linked_calendar_event_id: null, sort_order: null,
  created_at: "2026-11-01T10:00:00Z", updated_at: "2026-11-01T10:00:00Z", ...over,
});

const mountIt = () =>
  mount(ChronicleSection, { props: { lore: [], forces: [] }, global: { stubs: { CanonRubric: true, FocalImage: true, ChronicleAlmanac: true } } });

describe("ChronicleSection", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    canonBySession.current = {};
    items.value = [
      { session: session("s2", { number: 15, played_on: "2026-11-14" }), note: note({ session_id: "s2", player_visible_to: ["m1", "m2"] }) },
      { session: session("s1", { number: 14, title: "The Toll" }), note: null },
    ];
  });

  // Bug caught: the entry missing what the design draws: the session, its world date, who it is shared with and its words.
  it("shows a session's number, date in the world, audience and excerpt", () => {
    const entry = mountIt().findAll("[data-testid=chronicle-entry]")[0]!;
    expect(entry.text()).toContain("Session 15");
    expect(entry.find("[data-testid=chronicle-world-date]").text()).toContain("year 512");
    expect(entry.find("[data-testid=chronicle-shared]").text()).toBe("The whole party");
    expect(entry.find("[data-testid=chronicle-excerpt]").text()).toBe("The party followed the lanterns.");
  });

  // Bug caught: a note shared with nobody reading as shared with the party.
  it("says Not shared yet for a note nobody can read", () => {
    items.value = [{ session: session("s2"), note: note({ player_visible_to: [] }) }];
    expect(mountIt().find("[data-testid=chronicle-shared]").text()).toBe("Not shared yet");
  });

  // Bug caught: a session with no note given no way to start one, or both buttons pointing at the same editor mode.
  it("offers to write the chronicle for a session with no note, and to draft it with the Chronicler", () => {
    const entry = mountIt().findAll("[data-testid=chronicle-entry]")[1]!;
    expect(entry.attributes("data-written")).toBe("false");
    const hrefs = entry.findAllComponents({ name: "AppButton" }).map((b: { props: (k: string) => unknown }) => [b.props("label"), b.props("to")]);
    expect(hrefs).toEqual([
      ["Write the chronicle", { path: "/notes/new", query: { session: "s1" } }],
      ["Draft with the Chronicler", { path: "/notes/new", query: { session: "s1", chronicler: "1" } }],
    ]);
  });

  // Bug caught: the order control doing nothing.
  it("lists from the start when asked", async () => {
    const w = mountIt();
    expect(w.findAll("[data-testid=chronicle-entry]")[0]!.text()).toContain("Session 15");
    useCanonUiStore().chronicleOrder = "start";
    await w.vm.$nextTick();
    expect(w.findAll("[data-testid=chronicle-entry]")[0]!.text()).toContain("Session 14");
  });

  // Bug caught: a hundred sessions each opening their own learned read at once.
  it("shows ten sessions and offers the rest", async () => {
    items.value = Array.from({ length: 12 }, (_, i) => ({ session: session(`s${i}`, { number: i }), note: null }));
    const w = mountIt();
    expect(w.findAll("[data-testid=chronicle-entry]")).toHaveLength(10);
    await w.findAll("button").find((b: { text: () => string }) => b.text() === "Show 2 more")!.trigger("click");
    expect(w.findAll("[data-testid=chronicle-entry]")).toHaveLength(12);
  });

  const canonOf = (title: string) => ({ groups: [{ kind: "clues", label: "Clues found", items: [{ key: "clue:1", title, to: { path: "/canon", query: { entry: "sec1" } } }] }], total: 1 });

  // Bug caught (#1258 item 8): a session's canon changes not shown under its entry, or shown under another session's.
  it("shows the counts of what the canon did under the session they belong to, and nothing under one with none", () => {
    canonBySession.current = { s2: canonOf("A torn ledger") };
    const entries = mountIt().findAll("[data-testid=chronicle-entry]");
    expect(entries[0]!.get("[data-testid=chronicle-canon-count]").text()).toBe("Clues found 1");
    expect(entries[1]!.find("[data-testid=chronicle-canon]").exists()).toBe(false);
  });

  // Bug caught: the list opening on its own (crowding every entry), or its items not leading to their entry.
  it("opens the list on demand, each item leading to its entry", async () => {
    canonBySession.current = { s2: canonOf("A torn ledger") };
    const entry = mountIt().findAll("[data-testid=chronicle-entry]")[0]!;
    expect(entry.find("[data-testid=chronicle-canon-list]").exists()).toBe(false);
    await entry.get("[data-testid=chronicle-canon-toggle]").trigger("click");
    expect(entry.get("[data-testid=chronicle-canon-item]").text()).toBe("A torn ledger");
  });
});
