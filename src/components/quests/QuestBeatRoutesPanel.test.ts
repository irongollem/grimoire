import { mount, RouterLinkStub } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import QuestBeatRoutesPanel from "./QuestBeatRoutesPanel.vue";
import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";

vi.mock("@/composables/locations/useLocations", () => ({
  useLocationTree: () => ({ locationOptions: { value: [
    { id: "site-1", name: "The sealed crypt", location_type: "dungeon", parent_id: null, depth: 0 },
    { id: "room-1", name: "Room 1", location_type: "room", parent_id: "site-1", depth: 1 },
    { id: "room-2", name: "Room 2", location_type: "room", parent_id: "site-1", depth: 1 },
    { id: "room-3", name: "Room 3", location_type: "room", parent_id: "site-1", depth: 1 },
    // #886: a `wilds` site whose only interior children are `grounds`, not
    // `room` — regression fixture for the `isInteriorType` predicate fix.
    { id: "site-2", name: "The Thornwood", location_type: "wilds", parent_id: null, depth: 0 },
    { id: "grounds-1", name: "The clearing", location_type: "grounds", parent_id: "site-2", depth: 1 },
    { id: "grounds-2", name: "The grave plot", location_type: "grounds", parent_id: "site-2", depth: 1 },
  ] } }),
}));

const beat = { id: "beat-fork", quest_id: "quest-1", campaign_id: "campaign-1", title: "Confront Ser Vallis" } as QuestBeat;
const beats = [
  beat,
  { id: "beat-confess", quest_id: "quest-1", title: "Testify before the Guild", kind: "social" },
  { id: "beat-crypt", quest_id: "quest-1", title: "The cloister's sealed crypt", kind: "explore", staged_at_location_id: "site-1" },
  { id: "beat-wilds", quest_id: "quest-1", title: "The Thornwood's edge", kind: "explore", staged_at_location_id: "site-2" },
] as QuestBeat[];
const global = { stubs: { RouterLink: RouterLinkStub } };

describe("QuestBeatRoutesPanel", () => {
  it("shows an empty state and a working Add route link when the beat has no routes yet", () => {
    const wrapper = mount(QuestBeatRoutesPanel, { props: { beat, edges: [], beats }, global });
    expect(wrapper.text()).toContain("No routes out of this beat yet.");
    expect(wrapper.text()).toContain("0 choice · 0 parallel");
    const addRoute = wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Add route");
    expect(addRoute?.props("to")).toEqual({ path: "/quests/quest-1", query: { view: "work", beat: "beat-fork" } });
  });

  it("counts choice and parallel routes separately, ignoring routes that belong to another beat", () => {
    const edges = [
      { id: "edge-confess", quest_id: "quest-1", source_beat_id: "beat-fork", target_beat_id: "beat-confess", route_kind: "choice", thread_label: null },
      { id: "edge-crypt", quest_id: "quest-1", source_beat_id: "beat-fork", target_beat_id: "beat-crypt", route_kind: "parallel", thread_label: "Thread C" },
      { id: "edge-elsewhere", quest_id: "quest-1", source_beat_id: "beat-confess", target_beat_id: "beat-crypt", route_kind: "choice", thread_label: null },
    ] as QuestBeatEdge[];
    const wrapper = mount(QuestBeatRoutesPanel, { props: { beat, edges, beats }, global });
    expect(wrapper.text()).toContain("1 choice · 1 parallel");
    expect(wrapper.findAll("li")).toHaveLength(2);
  });

  it("names the target beat's title and kind on a choice route", () => {
    const edges = [
      { id: "edge-confess", quest_id: "quest-1", source_beat_id: "beat-fork", target_beat_id: "beat-confess", route_kind: "choice", thread_label: null },
    ] as QuestBeatEdge[];
    const wrapper = mount(QuestBeatRoutesPanel, { props: { beat, edges, beats }, global });
    const row = wrapper.get("li");
    expect(row.text()).toContain("Testify before the Guild");
    expect(row.text()).toContain("social");
    expect(row.text()).toContain("→ Testify before the Guild · cursor moves, the thread continues");
  });

  it("shows the opened thread label and the site's room count on a parallel route", () => {
    const edges = [
      { id: "edge-crypt", quest_id: "quest-1", source_beat_id: "beat-fork", target_beat_id: "beat-crypt", route_kind: "parallel", thread_label: "Thread C" },
    ] as QuestBeatEdge[];
    const wrapper = mount(QuestBeatRoutesPanel, { props: { beat, edges, beats }, global });
    const row = wrapper.get("li");
    expect(row.text()).toContain("opens Thread C");
    expect(row.text()).toContain("site · 3 rooms");
  });

  // #886: `grounds` moved into the interior tier beside `room` — a wilds
  // site's own children must still be counted here, or the chip vanishes
  // entirely (`v-if="route.site && route.site.roomCount > 0"`).
  it("counts a wilds site's grounds, not just its rooms", () => {
    const edges = [
      { id: "edge-wilds", quest_id: "quest-1", source_beat_id: "beat-fork", target_beat_id: "beat-wilds", route_kind: "parallel", thread_label: "Thread C" },
    ] as QuestBeatEdge[];
    const wrapper = mount(QuestBeatRoutesPanel, { props: { beat, edges, beats }, global });
    const row = wrapper.get("li");
    expect(row.text()).toContain("site · 2 rooms");
  });

  it("sends Edit route to the story flow with this beat and that edge selected", () => {
    const edges = [
      { id: "edge-confess", quest_id: "quest-1", source_beat_id: "beat-fork", target_beat_id: "beat-confess", route_kind: "choice", thread_label: null },
    ] as QuestBeatEdge[];
    const wrapper = mount(QuestBeatRoutesPanel, { props: { beat, edges, beats }, global });
    const editRoute = wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Edit route");
    expect(editRoute?.props("to")).toEqual({ path: "/quests/quest-1", query: { view: "work", beat: "beat-fork", edge: "edge-confess" } });
  });
});
