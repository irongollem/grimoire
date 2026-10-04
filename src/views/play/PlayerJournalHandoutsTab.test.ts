import { mount, RouterLinkStub } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PlayerJournalHandoutsTab from "./PlayerJournalHandoutsTab.vue";
import type { PlayerHandoutSummary } from "@/composables/scriptorium/usePlayerHandouts";

function handout(overrides: Partial<PlayerHandoutSummary> = {}): PlayerHandoutSummary {
  return {
    id: "h1",
    title: "A Letter from the Baron",
    doc_type: "adventure",
    campaign_id: "c1",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-02T00:00:00Z",
    ...overrides,
  };
}

function mountTab(props: { isLoading?: boolean; handouts: PlayerHandoutSummary[]; isNew?: (id: string, at: string) => boolean }) {
  return mount(PlayerJournalHandoutsTab, {
    props: {
      isLoading: props.isLoading ?? false,
      handouts: props.handouts,
      isNew: props.isNew ?? (() => false),
      formatDate: (iso: string) => `on ${iso.slice(0, 10)}`,
    },
    global: { stubs: { RouterLink: RouterLinkStub, LoadingSpinner: true, EntityNewDot: { props: ["isNew"], template: '<i v-if="isNew" data-testid="new-dot" />' } } },
  });
}

describe("PlayerJournalHandoutsTab", () => {
  it("lists each handout with title, type label and updated date", () => {
    const w = mountTab({ handouts: [handout(), handout({ id: "h2", title: "Map Fragment", doc_type: "location" })] });
    expect(w.text()).toContain("A Letter from the Baron");
    expect(w.text()).toContain("Adventure");
    expect(w.text()).toContain("on 2026-10-02");
    expect(w.text()).toContain("Map Fragment");
    expect(w.text()).toContain("Location");
  });

  it("links each card to the reader route", () => {
    const w = mountTab({ handouts: [handout()] });
    expect(w.findComponent(RouterLinkStub).props("to")).toEqual({ name: "play-handout", params: { id: "h1" } });
  });

  it("lights the new dot only for handouts the player has not caught up with", () => {
    const w = mountTab({
      handouts: [handout(), handout({ id: "h2", title: "Old news" })],
      isNew: (id) => id === "h1",
    });
    expect(w.findAll('[data-testid="new-dot"]')).toHaveLength(1);
  });

  it("shows the empty state in the app's voice", () => {
    const w = mountTab({ handouts: [] });
    expect(w.text()).toContain("Your DM has not handed you anything to read yet.");
  });

  it("shows the spinner while loading", () => {
    const w = mountTab({ isLoading: true, handouts: [] });
    expect(w.findComponent({ name: "LoadingSpinner" }).exists()).toBe(true);
    expect(w.text()).not.toContain("handed you");
  });
});
