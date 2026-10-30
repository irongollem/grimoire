import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { useVirtualGridViewport } from "@/components/common/list/virtualGridTestViewport";
import { describe, expect, it } from "vitest";
import PlayerJournalHandoutsTab from "./PlayerJournalHandoutsTab.vue";
import type { PlayerHandoutSummary } from "@/composables/scriptorium/usePlayerHandouts";

// jsdom has no layout; see the helper for what this stands in for.
useVirtualGridViewport({ viewportPx: 1000000, itemPx: 65 });

function handout(overrides: Partial<PlayerHandoutSummary> = {}): PlayerHandoutSummary {
  return {
    id: "h1",
    title: "A Letter from the Baron",
    doc_type: "adventure",
    kind: "handout",
    theme: "letter",
    campaign_id: "c1",
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-02T00:00:00Z",
    ...overrides,
  };
}

async function mountTab(props: { isLoading?: boolean; handouts: PlayerHandoutSummary[]; isNew?: (id: string, at: string) => boolean }) {
  const wrapper = mount(PlayerJournalHandoutsTab, {
    props: {
      isLoading: props.isLoading ?? false,
      handouts: props.handouts,
      isNew: props.isNew ?? (() => false),
      formatDate: (iso: string) => `on ${iso.slice(0, 10)}`,
    },
    global: { stubs: { RouterLink: RouterLinkStub, EntityNewDot: { props: ["isNew"], template: '<i v-if="isNew" data-testid="new-dot" />' } } },
  });
  // The windowed list finds its scroller after mount and renders its rows on the next tick.
  await flushPromises();
  return wrapper;
}

describe("PlayerJournalHandoutsTab", () => {
  it("lists each handout with title, the paper it is written on and updated date, and a book as a book", async () => {
    const w = await mountTab({
      handouts: [handout(), handout({ id: "h2", title: "Map Fragment", theme: "journal" }), handout({ id: "h3", title: "Sothery", kind: "book", theme: "onednd2024" })],
    });
    expect(w.text()).toContain("A Letter from the Baron");
    expect(w.text()).toContain("Letter");
    expect(w.text()).toContain("on 2026-10-02");
    expect(w.text()).toContain("Map Fragment");
    expect(w.text()).toContain("Journal page");
    expect(w.text()).toContain("Book");
    expect(w.text()).not.toContain("Adventure");
  });

  it("links each card to the reader route", async () => {
    const w = await mountTab({ handouts: [handout()] });
    expect(w.findComponent(RouterLinkStub).props("to")).toEqual({ name: "play-handout", params: { id: "h1" } });
  });

  it("lights the new dot only for handouts the player has not caught up with", async () => {
    const w = await mountTab({
      handouts: [handout(), handout({ id: "h2", title: "Old news" })],
      isNew: (id) => id === "h1",
    });
    expect(w.findAll('[data-testid="new-dot"]')).toHaveLength(1);
  });

  it("shows the empty state in the app's voice", async () => {
    const w = await mountTab({ handouts: [] });
    expect(w.text()).toContain("Your DM has not handed you anything to read yet.");
  });

  it("shows a skeleton while loading", async () => {
    const w = await mountTab({ isLoading: true, handouts: [] });
    expect(w.find("[role=status]").exists()).toBe(true);
    expect(w.text()).not.toContain("handed you");
  });
});
