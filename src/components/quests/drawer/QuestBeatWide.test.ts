import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import QuestBeatWide from "./QuestBeatWide.vue";
import type { Quest, QuestBeat } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  site: { value: null as null | { id: string; name: string; is_map_shared: boolean } },
  updateLocation: vi.fn(),
  beats: [] as unknown[],
  attachments: [] as unknown[],
  loot: [] as unknown[],
  transitions: [] as unknown[],
  query: {} as Record<string, unknown>,
  clocks: [] as unknown[],
}));
vi.mock("@/composables/quests/useQuestClocks", () => ({ useQuestClocks: () => ({ data: { get value() { return mocks.clocks; } } }) }));

vi.mock("vue-router", () => ({ useRoute: () => ({ query: mocks.query }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: (e: unknown) => String(e) }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useUpdateLocation: () => ({ mutate: mocks.updateLocation, isPending: ref(false) }) }));
vi.mock("@/composables/quests/useBeatStagedSite", async () => {
  const { computed } = await import("vue");
  return { useBeatStagedSite: () => ({ siteWithRooms: computed(() => mocks.site.value) }) };
});
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestBeats: () => ({ data: { get value() { return mocks.beats; } } }),
  useQuestBeatEdges: () => ({ data: { value: [] } }),
  useQuestBeatAttachmentSummaries: () => ({ data: { get value() { return mocks.attachments; } } }),
  useLootPlacements: () => ({ data: { get value() { return mocks.loot; } } }),
  useQuestConsequences: () => ({ data: { value: [] } }),
  useQuestBeatTransitionsForQuest: () => ({ data: { get value() { return mocks.transitions; } } }),
  useQuestRuntimeContext: () => ({ data: { value: { state: { status: "running" }, held: [] } } }),
}));
vi.mock("../run/QuestRunContainedTool.vue", () => ({ __esModule: true, default: { name: "QuestRunContainedTool", props: ["attachment"], template: "<div data-testid='tool'>{{ attachment.label }}</div>" } }));

const beat = { id: "beat-1", quest_id: "quest-1", campaign_id: "campaign-1", title: "Naerth's hospitality", staged_at_location_id: null } as QuestBeat;
const quest = (dm_content: string | null) => ({ id: "quest-1", title: "Targos", dm_content }) as Quest;
const doc = (...lines: string[]) => JSON.stringify({ type: "doc", content: lines.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })) });

const stubs = {
  QuestBeatAttachmentsPanel: { name: "QuestBeatAttachmentsPanel", props: ["beat", "attachments"], emits: ["open"], template: "<div data-testid='attachments' />" },
  QuestPayoffPanel: { name: "QuestPayoffPanel", props: ["beat", "loot"], template: "<div data-testid='payoff' />" },
  QuestBeatWideRead: { name: "QuestBeatWideRead", props: ["beat", "reachedBeatIds", "partyBeatIds"], emits: ["edit-text"], template: "<div data-testid='read' />" },
  QuestBeatWidePrep: { name: "QuestBeatWidePrep", props: ["gaps"], template: "<div data-testid='prep' />" },
  QuestRunHeldPayoff: { name: "QuestRunHeldPayoff", props: ["loot", "held", "campaignId"], template: "<div data-testid='held'>{{ loot.length }}</div>" },
  QuestRunClocks: { name: "QuestRunClocks", template: "<div data-testid='clocks' />" },
  QuestSiteHandoff: { name: "QuestSiteHandoff", emits: ["advance"], template: "<div data-testid='handoff' />" },
};

function mountWide(props: Partial<InstanceType<typeof QuestBeatWide>["$props"]> = {}) {
  return mount(QuestBeatWide, {
    props: {
      questId: "quest-1", beatId: "beat-1", quest: quest(null), threads: [], focusThreadId: "thread-a",
      currentBeatIdByThread: { "thread-a": null }, presentations: {}, ...props,
    },
    global: { stubs },
  });
}

describe("QuestBeatWide", () => {
  beforeEach(() => {
    mocks.site.value = null;
    mocks.updateLocation.mockReset();
    mocks.beats = [beat];
    mocks.attachments = [];
    mocks.loot = [];
    mocks.transitions = [];
    mocks.query = {};
    mocks.clocks = [];
  });

  // Fails if the table section is shown empty, or the held loot never reaches it.
  it("shows 'At the table' with loot the run holds, and not at all with no held loot and no clock", () => {
    expect(mountWide().find('[aria-label="At the table"]').exists()).toBe(false);
    mocks.transitions = [{ transition_kind: "advance", to_quest_id: "quest-1", to_beat_id: "beat-1" }];
    mocks.loot = [{ id: "l1", beat_id: "beat-1", delivery_state: "held" }];
    const wrapper = mountWide();
    expect(wrapper.find('[aria-label="At the table"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="held"]').text()).toBe("1");
  });

  // Fails if loot no run has reached is offered for dispatch, or clocks alone do not open the section.
  it("ignores held loot on a beat the run has not reached, and shows the section for a clock alone", () => {
    mocks.loot = [{ id: "l1", beat_id: "beat-1", delivery_state: "held" }];
    expect(mountWide().find('[aria-label="At the table"]').exists()).toBe(false);
    mocks.clocks = [{ id: "c1" }];
    const wrapper = mountWide();
    expect(wrapper.find('[data-testid="clocks"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="held"]').exists()).toBe(false);
  });

  it("shows no site section for a beat that is not staged at a site with rooms", () => {
    const wrapper = mountWide();
    expect(wrapper.find('[aria-label="The site"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="handoff"]').exists()).toBe(false);
  });

  it("leads with the site, full width above the columns, when the beat is staged at one with rooms", () => {
    mocks.site.value = { id: "site-1", name: "Speaker's offices", is_map_shared: false };
    const wrapper = mountWide();
    const html = wrapper.html();
    expect(wrapper.get('[aria-label="The site"]').text()).toContain("Speaker's offices");
    expect(wrapper.find('[data-testid="handoff"]').exists()).toBe(true);
    expect(html.indexOf('aria-label="The site"')).toBeLessThan(html.indexOf('data-testid="attachments"'));
  });

  it("Leave site folds the handoff away and Enter site brings it back", async () => {
    mocks.site.value = { id: "site-1", name: "Speaker's offices", is_map_shared: false };
    const wrapper = mountWide();
    const press = (label: string) => wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label)!.trigger("click");
    await press("Leave site");
    expect(wrapper.find('[data-testid="handoff"]').exists()).toBe(false);
    await press("Enter site");
    expect(wrapper.find('[data-testid="handoff"]').exists()).toBe(true);
  });

  it("shares and hides the site's map with the table through the place itself", async () => {
    mocks.site.value = { id: "site-1", name: "Speaker's offices", is_map_shared: false };
    const wrapper = mountWide();
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Show map to players")!.trigger("click");
    expect(mocks.updateLocation).toHaveBeenCalledWith({ id: "site-1", update: { is_map_shared: true } }, expect.anything());
  });

  it("hands the panels only this beat's attachments and loot", () => {
    mocks.attachments = [{ id: "a-1", beat_id: "beat-1" }, { id: "a-2", beat_id: "beat-2" }];
    mocks.loot = [{ id: "l-1", beat_id: "beat-1" }, { id: "l-2", beat_id: "beat-2" }];
    const wrapper = mountWide();
    expect(wrapper.getComponent(stubs.QuestBeatAttachmentsPanel).props("attachments")).toEqual([{ id: "a-1", beat_id: "beat-1" }]);
    expect(wrapper.getComponent(stubs.QuestPayoffPanel).props("loot")).toEqual([{ id: "l-1", beat_id: "beat-1" }]);
  });

  it("feeds the visibility floor from where the party stands and where it has been", () => {
    mocks.transitions = [{ to_beat_id: "beat-9" }, { to_beat_id: null }];
    const wrapper = mountWide({ currentBeatIdByThread: { "thread-a": "beat-2", "thread-b": null } });
    const read = wrapper.getComponent(stubs.QuestBeatWideRead);
    expect([...(read.props("partyBeatIds") as Set<string>)]).toEqual(["beat-2"]);
    expect([...(read.props("reachedBeatIds") as Set<string>)]).toEqual(["beat-9"]);
  });

  it("passes the beat's prep gaps to the prep part, and re-emits the request to edit its text", async () => {
    const gaps = [{ kind: "guidance", label: "Add DM guidance" }];
    const wrapper = mountWide({ presentations: { "beat-1": { prepGaps: gaps } as never } });
    expect(wrapper.getComponent(stubs.QuestBeatWidePrep).props("gaps")).toEqual(gaps);
    wrapper.getComponent(stubs.QuestBeatWideRead).vm.$emit("edit-text");
    expect(wrapper.emitted("edit-text")).toHaveLength(1);
  });

  it("opens a placement in the contained tool and closes it again", async () => {
    const wrapper = mountWide();
    wrapper.getComponent(stubs.QuestBeatAttachmentsPanel).vm.$emit("open", { id: "a-1", label: "Naerth" });
    await flushPromises();
    expect(wrapper.get('[data-testid="tool"]').text()).toBe("Naerth");
  });

  describe("the quest's notes", () => {
    it("are not offered when the quest has none, even a blank document", () => {
      expect(mountWide({ quest: quest(null) }).text()).not.toContain("The quest's notes");
      expect(mountWide({ quest: quest(doc("")) }).text()).not.toContain("The quest's notes");
    });

    it("start folded with the first line as a preview, and open on the button", async () => {
      const wrapper = mountWide({ quest: quest(doc("", "The party travels as fugitives.", "Second line")) });
      const toggle = wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "The quest's notes")!;
      expect(toggle.attributes("aria-expanded")).toBe("false");
      expect(wrapper.get('[data-testid="notes-preview"]').text()).toBe("The party travels as fugitives.");
      await toggle.trigger("click");
      expect(toggle.attributes("aria-expanded")).toBe("true");
      expect(wrapper.find('[data-testid="notes-preview"]').exists()).toBe(false);
    });
  });

  it("says so when the beat is gone", () => {
    mocks.beats = [];
    expect(mountWide().text()).toContain("This beat is missing or unavailable.");
  });
});
