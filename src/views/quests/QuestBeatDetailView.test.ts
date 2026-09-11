import { reactive, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestBeatDetailView from "./QuestBeatDetailView.vue";
import DockBar from "@/components/common/DockBar.vue";
import type { QuestBeat, QuestBeatAttachmentSummary, LootPlacement } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  route: { params: { id: "quest-1", beatId: "beat-1" }, query: {} as Record<string, string> },
  update: vi.fn(),
  confirm: vi.fn(),
  beat: null as QuestBeat | null,
  quest: { id: "quest-1", title: "The Tithe of Ashmouth", player_visible_to: [] as string[] },
  beats: [] as QuestBeat[],
  edges: [] as unknown[],
  attachments: [] as QuestBeatAttachmentSummary[],
  loot: [] as LootPlacement[],
  consequences: [] as unknown[],
  liveQuests: [] as unknown[],
  threads: [] as unknown[],
  locationOptions: [] as unknown[],
  siteReadiness: undefined as Record<string, unknown> | undefined,
  // #872 review fix 2: happy-dom's own `matchMedia` always answers "not
  // matched", so `useBelow("lg")` already defaults to desktop (`false`)
  // without mocking — every pre-existing test below keeps exercising the
  // desktop `QuestBeatIdentityFields` copy exactly as it did before the
  // extraction. Only the new below-`lg` test flips this explicitly.
  belowLg: false,
}));

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRoute: () => reactive(mocks.route),
}));
vi.mock("@/composables/useBreakpoint", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useBelow: () => ref(mocks.belowLg),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/quests/useQuests", () => ({
  useQuest: () => ({ data: { get value() { return mocks.quest; } }, isLoading: ref(false) }),
}));
vi.mock("@/composables/quests/useQuestThreads", () => ({
  useQuestThreads: () => ({ data: { get value() { return mocks.threads; } } }),
}));
vi.mock("@/composables/locations/useLocations", () => ({
  useLocationTree: () => ({ locationOptions: { get value() { return mocks.locationOptions; } } }),
}));
vi.mock("@/composables/locations/useSiteStructure", () => ({
  useSiteStructure: () => ({ readiness: { get value() { return mocks.siteReadiness; } } }),
}));
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestBeat: () => ({ data: { get value() { return mocks.beat; } }, isLoading: ref(false) }),
  useQuestBeats: () => ({ data: { get value() { return mocks.beats; } } }),
  useQuestBeatEdges: () => ({ data: { get value() { return mocks.edges; } } }),
  useQuestBeatAttachmentSummaries: () => ({ data: { get value() { return mocks.attachments; } }, isLoading: ref(false) }),
  useLootPlacements: () => ({ data: { get value() { return mocks.loot; } }, isLoading: ref(false) }),
  useQuestConsequences: () => ({ data: { get value() { return mocks.consequences; } } }),
  useCampaignLiveQuests: () => ({ data: { get value() { return mocks.liveQuests; } } }),
  useUpdateQuestBeat: () => ({ mutateAsync: mocks.update }),
}));

function beat(overrides: Partial<QuestBeat> = {}): QuestBeat {
  return {
    id: "beat-1", quest_id: "quest-1", campaign_id: "campaign-1", title: "Confront Ser Vallis",
    dm_content: null, read_aloud: null, how_it_plays: null, converge_mode: "any",
    rumor_text: null, reveal_text: null, visibility: "rumored", kind: "social",
    presentation_hint: null, staged_at_location_id: null, canvas_x: 0, canvas_y: 0, is_improvised: false,
    improv_reviewed_at: null, created_by: "dm", created_at: "now", updated_at: "version-1",
    ...overrides,
  };
}

const stubs = {
  PageHeader: { props: ["title", "description"], template: '<div><p class="js-title">{{ title }}</p><p class="js-description">{{ description }}</p><div class="js-actions"><slot name="actions" /></div><slot /></div>' },
  QuestBeatFields: true,
  QuestBeatAttachmentsPanel: true,
  QuestBeatSitePanel: true,
  QuestBeatRoutesPanel: true,
  QuestPayoffPanel: true,
  QuestPlayerPreviewDrawer: true,
  EntityCombobox: true,
  RichTextViewer: true,
  RouterLink: { template: "<a><slot /></a>" },
};

function mountView() {
  return mount(QuestBeatDetailView, { global: { stubs } });
}

describe("QuestBeatDetailView", () => {
  beforeEach(() => {
    mocks.route.params = { id: "quest-1", beatId: "beat-1" };
    mocks.route.query = {};
    mocks.update.mockReset();
    mocks.update.mockImplementation(async (input: { update: Partial<QuestBeat> }) => ({ ...beat(), ...input.update, updated_at: "version-2" }));
    mocks.confirm.mockReset();
    mocks.confirm.mockResolvedValue(true);
    mocks.beat = beat();
    mocks.beats = [mocks.beat];
    mocks.edges = [];
    mocks.attachments = [];
    mocks.loot = [];
    mocks.consequences = [];
    mocks.liveQuests = [];
    mocks.threads = [];
    mocks.locationOptions = [];
    mocks.siteReadiness = undefined;
    mocks.belowLg = false;
  });

  it("shows the missing-beat message when the beat does not belong to this quest", () => {
    mocks.beat = beat({ quest_id: "quest-other" });
    const wrapper = mountView();
    expect(wrapper.text()).toContain("This beat is missing or unavailable.");
  });

  it("builds the eyebrow from kind, thread letter, and whether a live thread stands here", () => {
    mocks.liveQuests = [{ quest_id: "quest-1", beat_id: "beat-1", thread_id: "thread-b" }];
    mocks.threads = [
      { id: "thread-a", label: "Main", status: "live", created_at: "2026-01-01T00:00:00Z" },
      { id: "thread-b", label: "The vault", status: "live", created_at: "2026-01-02T00:00:00Z" },
    ];
    const wrapper = mountView();
    expect(wrapper.get(".js-description").text()).toBe("Social · Thread B · party is here");
  });

  it("shows an em dash when no live thread currently stands at this beat", () => {
    const wrapper = mountView();
    expect(wrapper.get(".js-description").text()).toBe("Social · —");
  });

  it("counts this beat's own prep gaps in the Beat panel's chip", () => {
    mocks.beat = beat({ dm_content: null, how_it_plays: null, rumor_text: null });
    const wrapper = mountView();
    expect(wrapper.text()).toContain("prep gap");
  });

  it("changes kind immediately through the inline select", async () => {
    const wrapper = mountView();
    await wrapper.get('select[aria-label="Kind"]').setValue("combat");
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({ id: "beat-1", questId: "quest-1", update: { kind: "combat" } });
  });

  it("keeps the visibility select hidden until Edit is clicked, then saves and closes it", async () => {
    const wrapper = mountView();
    expect(wrapper.find('select[aria-label="Player visibility"]').exists()).toBe(false);

    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Edit")!.trigger("click");
    const select = wrapper.get('select[aria-label="Player visibility"]');
    await select.setValue("revealed");
    await flushPromises();

    expect(mocks.update).toHaveBeenCalledWith({ id: "beat-1", questId: "quest-1", update: { visibility: "revealed" } });
    expect(wrapper.find('select[aria-label="Player visibility"]').exists()).toBe(false);
  });

  it("describes an unstaged beat, and a beat staged at a non-site place", async () => {
    const unstaged = mountView();
    expect(unstaged.text()).toContain("Not staged");
    expect(unstaged.text()).toContain("staged at · nowhere yet");

    mocks.beat = beat({ staged_at_location_id: "loc-1" });
    mocks.locationOptions = [{ id: "loc-1", name: "Ashmouth", location_type: "town", parent_id: null }];
    const staged = mountView();
    expect(staged.text()).toContain("Ashmouth");
    expect(staged.text()).toContain("staged at · not a site — no room surface");
  });

  it("describes a beat staged at a site by its room count", () => {
    mocks.beat = beat({ staged_at_location_id: "site-1" });
    mocks.locationOptions = [
      { id: "site-1", name: "The sealed crypt", location_type: "dungeon", parent_id: null },
      { id: "room-1", name: "Room 1", location_type: "room", parent_id: "site-1" },
      { id: "room-2", name: "Room 2", location_type: "room", parent_id: "site-1" },
    ];
    const wrapper = mountView();
    expect(wrapper.text()).toContain("staged at · site: 2 rooms");
  });

  it("describes a beat staged at a room by the site it opens into, not as a non-site place (#868 S12)", () => {
    mocks.beat = beat({ staged_at_location_id: "room-1" });
    mocks.locationOptions = [
      { id: "site-1", name: "The sealed crypt", location_type: "dungeon", parent_id: null },
      { id: "room-1", name: "Nave of Ash", location_type: "room", parent_id: "site-1" },
      { id: "room-2", name: "Room 2", location_type: "room", parent_id: "site-1" },
    ];
    const wrapper = mountView();
    expect(wrapper.text()).toContain("Nave of Ash");
    expect(wrapper.text()).toContain("staged at · opens at this room in The sealed crypt — 2 rooms");
  });

  it("adds the site's readiness to the beat's own prep gap count once staged there", () => {
    mocks.beat = beat({ staged_at_location_id: "site-1", dm_content: "Prepared", how_it_plays: "Explore", visibility: "hidden" });
    mocks.locationOptions = [{ id: "site-1", name: "The sealed crypt", location_type: "dungeon", parent_id: null }];
    const clean = mountView();
    expect(clean.text()).not.toContain("prep gap");

    mocks.siteReadiness = { bound: false, waysOut: true, caption: "1 space unbound" };
    const withGap = mountView();
    expect(withGap.text()).toContain("1 prep gap");
  });

  it("offers Reveal fully for a rumored beat and Reveal to players for a hidden one, but no reveal action once revealed", async () => {
    mocks.beat = beat({ visibility: "rumored" });
    const rumored = mountView();
    expect(rumored.findAllComponents({ name: "AppButton" }).some((button) => button.props("label") === "Reveal fully")).toBe(true);

    mocks.beat = beat({ visibility: "hidden" });
    const hidden = mountView();
    expect(hidden.findAllComponents({ name: "AppButton" }).some((button) => button.props("label") === "Reveal to players")).toBe(true);

    mocks.beat = beat({ visibility: "revealed" });
    const revealed = mountView();
    expect(revealed.findAllComponents({ name: "AppButton" }).some((button) => button.props("label")?.startsWith("Reveal"))).toBe(false);
  });

  it("reveals the beat after confirming, using the existing reveal mutation", async () => {
    const wrapper = mountView();
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Reveal fully")!.trigger("click");
    await flushPromises();

    expect(mocks.confirm).toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({
      id: "beat-1", questId: "quest-1", expectedUpdatedAt: "version-1", update: { visibility: "revealed" },
    });
  });

  it("does not reveal when the confirmation is declined", async () => {
    mocks.confirm.mockResolvedValue(false);
    const wrapper = mountView();
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Reveal fully")!.trigger("click");
    await flushPromises();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("opens the player preview drawer from the page header action", async () => {
    const wrapper = mountView();
    expect(wrapper.findComponent({ name: "QuestPlayerPreviewDrawer" }).exists()).toBe(false);
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Preview as players")!.trigger("click");
    expect(wrapper.findComponent({ name: "QuestPlayerPreviewDrawer" }).exists()).toBe(true);
  });

  it("passes only this beat's own attachments and loot down to the Placements and Payoff panels", () => {
    mocks.attachments = [
      { id: "a-1", beat_id: "beat-1" } as QuestBeatAttachmentSummary,
      { id: "a-2", beat_id: "beat-other" } as QuestBeatAttachmentSummary,
    ];
    mocks.loot = [
      { id: "loot-1", beat_id: "beat-1" } as LootPlacement,
      { id: "loot-2", beat_id: "beat-other" } as LootPlacement,
    ];
    const wrapper = mountView();
    expect(wrapper.findComponent({ name: "QuestBeatAttachmentsPanel" }).props("attachments")).toEqual([{ id: "a-1", beat_id: "beat-1" }]);
    expect(wrapper.findComponent({ name: "QuestPayoffPanel" }).props("loot")).toEqual([{ id: "loot-1", beat_id: "beat-1" }]);
  });

  // ── Phone layout (frame 3, #872) ───────────────────────────────────────────
  // Below `lg` the mobile block renders alongside the desktop grid (hidden by
  // Tailwind classes jsdom does not evaluate), so these assert on its content
  // directly rather than mocking a breakpoint.

  it("collapses payoff, routes, attachments and site into fold rows with counted captions", () => {
    mocks.beat = beat({
      // `dm_content`/`how_it_plays` are saved as Tiptap JSON strings
      // (`JSON.stringify(editor.getJSON())`), never HTML — see
      // RichTextEditor.vue and countQuestBeatContentBlocks.
      dm_content: JSON.stringify({ type: "doc", content: [{ type: "paragraph" }, { type: "paragraph" }] }),
      how_it_plays: JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }),
      staged_at_location_id: "site-1",
    });
    mocks.locationOptions = [{ id: "site-1", name: "The sealed crypt", location_type: "dungeon", parent_id: null }];
    mocks.edges = [
      { id: "e-1", source_beat_id: "beat-1", route_kind: "choice" },
      { id: "e-2", source_beat_id: "beat-1", route_kind: "parallel" },
    ];
    mocks.consequences = [{ id: "c-1", on_beat_id: "beat-1", on_edge_id: null }];
    mocks.loot = [{ id: "loot-1", beat_id: "beat-1", delivery_state: "held" } as LootPlacement];
    mocks.attachments = [
      { id: "a-1", beat_id: "beat-1", attachment_type: "npc", label: "Grimlock Watch" } as QuestBeatAttachmentSummary,
    ];
    const wrapper = mountView();
    expect(wrapper.text()).toContain("3 paragraphs");
    expect(wrapper.text()).toContain("1 consequence · 1 loot held");
    expect(wrapper.text()).toContain("1 choice · 1 parallel");
    expect(wrapper.text()).toContain("NPC");
    expect(wrapper.text()).toContain("The sealed crypt · 0 rooms");
  });

  it("keeps the Kind/staged-location/Visibility editor reachable below `lg`, inside a Beat fold (#872 review fix 2)", () => {
    mocks.belowLg = true;
    mocks.beat = beat({ kind: "explore", visibility: "revealed", staged_at_location_id: "loc-1" });
    mocks.locationOptions = [{ id: "loc-1", name: "Ashmouth Chapel", location_type: "town", parent_id: null }];
    const wrapper = mountView();

    const fold = wrapper.findAll("[aria-expanded]").find((node) => node.text().includes("Beat"))!;
    expect(fold.text()).toContain("Explore · Revealed · Ashmouth Chapel");
    wrapper.get('select[aria-label="Kind"]');
  });

  it("mounts the Beat identity editor only once regardless of breakpoint", () => {
    const belowLg = mountView();
    expect(belowLg.findAllComponents({ name: "QuestBeatIdentityFields" }).length).toBe(1);

    mocks.belowLg = true;
    const aboveLg = mountView();
    expect(aboveLg.findAllComponents({ name: "QuestBeatIdentityFields" }).length).toBe(1);
  });

  it("opens a fold row on tap", async () => {
    mocks.attachments = [
      { id: "a-1", beat_id: "beat-1", attachment_type: "npc", label: "Grimlock Watch" } as QuestBeatAttachmentSummary,
    ];
    const wrapper = mountView();
    const attachmentsToggle = wrapper.findAll("[aria-expanded]").find((node) => node.text().includes("Attachments"))!;
    expect(attachmentsToggle.attributes("aria-expanded")).toBe("false");
    await attachmentsToggle.trigger("click");
    expect(attachmentsToggle.attributes("aria-expanded")).toBe("true");
  });

  it("renders the phone dock and reveals from it through the same mutation as the desktop action", async () => {
    const wrapper = mountView();
    const dock = wrapper.findComponent(DockBar);
    expect(dock.exists()).toBe(true);

    const revealButton = dock.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Reveal fully")!;
    await revealButton.trigger("click");
    await flushPromises();

    expect(mocks.confirm).toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({
      id: "beat-1", questId: "quest-1", expectedUpdatedAt: "version-1", update: { visibility: "revealed" },
    });
  });

  it("swaps the dock's reveal action for Preview as players once the beat is revealed", async () => {
    mocks.beat = beat({ visibility: "revealed" });
    const wrapper = mountView();
    const dock = wrapper.findComponent(DockBar);

    expect(wrapper.findComponent({ name: "QuestPlayerPreviewDrawer" }).exists()).toBe(false);
    const previewButton = dock.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Preview as players")!;
    await previewButton.trigger("click");
    expect(wrapper.findComponent({ name: "QuestPlayerPreviewDrawer" }).exists()).toBe(true);
  });
});
