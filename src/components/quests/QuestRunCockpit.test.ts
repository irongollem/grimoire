import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestRunCockpit from "./QuestRunCockpit.vue";
import QuestRunSessionPanel from "./QuestRunSessionPanel.vue";
import QuestRunJumpPanel from "./QuestRunJumpPanel.vue";
import QuestRunBeatCard from "./QuestRunBeatCard.vue";
import QuestRunOutcomeStrip from "./QuestRunOutcomeStrip.vue";
import QuestPlayerPreviewDrawer from "./QuestPlayerPreviewDrawer.vue";
import QuestRunOpenChains from "./QuestRunOpenChains.vue";
import QuestThreadBar from "./QuestThreadBar.vue";
import QuestAdvanceDialog from "./QuestAdvanceDialog.vue";

const mocks = vi.hoisted(() => ({
  context: { value: null as Record<string, unknown> | null },
  beats: { value: [] as Array<Record<string, unknown>> },
  edges: { value: [] as Array<Record<string, unknown>> },
  targets: { value: [] as Array<Record<string, unknown>> },
  quests: { value: [] as Array<Record<string, unknown>> },
  quest: { value: null as Record<string, unknown> | null },
  unlockEntry: { value: null as Record<string, unknown> | null },
  bridgeBeat: { value: null as Record<string, unknown> | null },
  liveQuests: { value: [] as Array<Record<string, unknown>> },
  objectives: { value: [] as Array<Record<string, unknown>> },
  consequences: { value: [] as Array<Record<string, unknown>> },
  locations: { value: [] as Array<Record<string, unknown>> },
  threads: { value: [{ id: "thread-1", status: "live", label: "Main", created_at: "2026-01-01T00:00:00Z" }] as Array<Record<string, unknown>> },
  mutateAsync: vi.fn(),
  updateBeat: vi.fn(),
  improvise: vi.fn(),
  refetch: vi.fn(),
  replace: vi.fn(),
  route: { query: { view: "run" } as Record<string, string> },
  activeCampaignId: "c1" as string | null,
}));

vi.mock("vue-router", () => ({ useRoute: () => mocks.route, useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn(async () => true) }) }));
vi.mock("@/composables/useHotkeys", () => ({ useHotkeys: vi.fn() }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: mocks.activeCampaignId }) }));
vi.mock("@/composables/locations/useLocations", () => ({ useAllLocations: () => ({ data: mocks.locations }) }));
vi.mock("@/composables/quests/useQuests", () => ({
  useQuests: () => ({ data: mocks.quests }),
  useQuest: () => ({ data: mocks.quest }),
  useQuestObjectives: () => ({ data: mocks.objectives }),
}));
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestRuntimeContext: () => ({ data: mocks.context, isLoading: { value: false }, error: { value: null }, refetch: mocks.refetch }),
  useQuestRuntimeCommand: () => ({ mutateAsync: mocks.mutateAsync }),
  useQuestBeats: () => ({ data: mocks.beats }),
  useQuestBeat: () => ({ data: mocks.bridgeBeat }),
  useQuestBeatEdges: () => ({ data: mocks.edges }),
  useQuestBeatAttachmentSummaries: () => ({ data: { value: [] } }),
  useLootPlacements: () => ({ data: { value: [] } }),
  useQuestConsequences: () => ({ data: mocks.consequences }),
  useQuestUnlockEntry: () => ({ data: mocks.unlockEntry }),
  useQuestRuntimeJumpTargets: () => ({ data: mocks.targets }),
  useCampaignLiveQuests: () => ({ data: mocks.liveQuests }),
  useUpdateQuestBeat: () => ({ mutateAsync: mocks.updateBeat }),
  useQuestRuntimeImprovise: () => ({ mutateAsync: mocks.improvise }),
}));
vi.mock("@/composables/quests/useQuestThreads", () => ({
  useQuestThreads: () => ({ data: mocks.threads }),
}));

const beat = { id: "b1", quest_id: "q1", campaign_id: "c1", title: "Opening", kind: "social" };
const runningContext = () => ({
  state: { campaign_id: "c1", quest_id: "q1", current_beat_id: "b1", status: "running", version: 4 },
  current: beat,
  previous: { beat_id: "b0" },
  outgoing: [{ edge_id: "e1", quest_id: "q1", beat_id: "b2", gate: null, effects: [], beat_title: "Next", beat_kind: "neutral", route_kind: "choice", thread_label: null, converge_mode: "any", site: null, payoff: [], loot: [] }],
  return_target: null,
  path_so_far: [],
  thread: { id: "thread-1", label: "Main", status: "live", created_at: "2026-01-01T00:00:00Z" },
  threads: [{ id: "thread-1", label: "Main", status: "live", created_at: "2026-01-01T00:00:00Z", current_beat_id: "b1", current_beat_title: "Opening", runtime_status: "running", version: 4 }],
  held: [],
});

describe("QuestRunCockpit", () => {
  beforeEach(() => {
    mocks.context.value = null;
    mocks.beats.value = [beat];
    mocks.edges.value = [];
    mocks.targets.value = [];
    mocks.quests.value = [];
    mocks.quest.value = { id: "q1", entry_beat_id: null };
    mocks.unlockEntry.value = null;
    mocks.bridgeBeat.value = null;
    mocks.liveQuests.value = [];
    mocks.objectives.value = [];
    mocks.consequences.value = [];
    mocks.locations.value = [];
    mocks.threads.value = [{ id: "thread-1", status: "live", label: "Main", created_at: "2026-01-01T00:00:00Z" }];
    mocks.route.query = {};
    mocks.activeCampaignId = "c1";
    mocks.mutateAsync.mockReset();
    mocks.mutateAsync.mockImplementation(async () => mocks.context.value);
    mocks.refetch.mockReset();
    mocks.replace.mockReset();
    mocks.updateBeat.mockReset();
    mocks.improvise.mockReset();
  });

  // The start card tells, not asks (#871): with a declared entry it renders
  // that beat's headline and prose directly, and "Start here" starts it —
  // no picker interaction needed at all.
  it("tells the DM the declared entry beat, with its read-aloud, and starts there", async () => {
    mocks.quest.value = { id: "q1", entry_beat_id: "b1" };
    mocks.beats.value = [{ ...beat, read_aloud: "The tavern hums with quiet dread." }];
    const wrapper = shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("Where the story begins");
    expect(wrapper.text()).toContain("Opening");
    expect(wrapper.findComponent({ name: "RichTextViewer" }).props("content")).toBe("The tavern hums with quiet dread.");
    expect(wrapper.findComponent({ name: "EntityCombobox" }).exists()).toBe(false);

    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Start here")!.trigger("click");
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ command: "start", expectedVersion: 0, targetBeatId: "b1" }));
  });

  // "Start elsewhere" reveals the same override picker the cockpit always
  // had — roots ranked first (#793) — inline, with its own "Start run".
  it("reveals the override picker from Start elsewhere, ranking roots first, and starts the picked beat", async () => {
    mocks.quest.value = { id: "q1", entry_beat_id: "b1" };
    mocks.beats.value = [
      { id: "b2", quest_id: "q1", campaign_id: "c1", title: "Second beat", kind: "neutral" },
      beat,
    ];
    mocks.edges.value = [{ id: "e1", quest_id: "q1", campaign_id: "c1", source_beat_id: "b1", target_beat_id: "b2" }];
    const wrapper = shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent({ name: "EntityCombobox" }).exists()).toBe(false);

    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Start elsewhere")!.trigger("click");
    await wrapper.vm.$nextTick();

    const combobox = wrapper.findComponent({ name: "EntityCombobox" });
    expect(combobox.props("modelValue")).toBe("b1");
    const options = combobox.props("options") as Array<{ id: string }>;
    expect(options[0]!.id).toBe("b1");

    combobox.vm.$emit("update:modelValue", "b2");
    await wrapper.vm.$nextTick();
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Start run")!.trigger("click");
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ command: "start", targetBeatId: "b2" }));
  });

  // No entry, no bridge, and more than one root: there is nothing to resolve
  // to, so the start card shows the picker directly rather than a "tell" card
  // for a beat it cannot actually name.
  it("shows the picker directly when nothing resolves", async () => {
    mocks.quest.value = { id: "q1", entry_beat_id: null };
    mocks.beats.value = [
      beat,
      { id: "b2", quest_id: "q1", campaign_id: "c1", title: "Second beat", kind: "neutral" },
    ];
    mocks.edges.value = [];
    const wrapper = shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent({ name: "EntityCombobox" }).exists()).toBe(true);
    expect(wrapper.findAllComponents({ name: "AppButton" }).some((button) => button.props("label") === "Start here")).toBe(false);
  });

  // A bridge that just promoted this quest wins over its own declared entry
  // (#871) — the caption names the beat that raised it and the quest it
  // belongs to, read off the event log via `useQuestUnlockEntry`.
  it("names the bridge that entered this quest sideways, and starts at its landing beat", async () => {
    mocks.quest.value = { id: "q1", entry_beat_id: "b1" };
    mocks.beats.value = [
      beat,
      { id: "b2", quest_id: "q1", campaign_id: "c1", title: "The sealed antechamber", kind: "neutral" },
    ];
    mocks.unlockEntry.value = { entryBeatId: "b2", fromBeatId: "b9" };
    mocks.bridgeBeat.value = { id: "b9", quest_id: "q9", title: "The Vault's Keeper" };
    mocks.quests.value = [{ id: "q9", title: "The Sunken Reliquary" }];
    const wrapper = shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain("Entered through “The Vault's Keeper” in The Sunken Reliquary");
    expect(wrapper.text()).toContain("The sealed antechamber");

    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Start here")!.trigger("click");
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ command: "start", targetBeatId: "b2" }));
  });

  it("routes previous, pause, resume and jump through versioned commands, from the session panel", async () => {
    mocks.context.value = runningContext();
    const wrapper = shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    const session = wrapper.findComponent(QuestRunSessionPanel);
    session.vm.$emit("previous");
    session.vm.$emit("pause");
    await wrapper.vm.$nextTick();
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ command: "previous", expectedVersion: 4 }));
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ command: "pause" }));
    await flushPromises();

    session.vm.$emit("jump");
    await wrapper.vm.$nextTick();
    wrapper.findComponent(QuestRunJumpPanel).vm.$emit("jump", { quest_id: "q1", beat_id: "b9" }, "A detour", true);
    await wrapper.vm.$nextTick();
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ command: "jump", questId: "q1", targetBeatId: "b9", pushReturn: true }));

    mocks.context.value = { ...runningContext(), state: { ...runningContext().state, status: "paused" } };
    const paused = shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    paused.findComponent(QuestRunSessionPanel).vm.$emit("resume");
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ command: "resume" }));
  });

  // The Advance dialog (story G) is "the only place a thread is created" in
  // the redesign — Choosing a route no longer transitions on its own click.
  // It opens the dialog preselected on that route instead of calling the
  // runtime command directly.
  it("opens the Advance dialog preselected on the chosen route instead of transitioning directly", async () => {
    mocks.context.value = runningContext();
    const wrapper = shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    wrapper.findComponent(QuestRunOutcomeStrip).vm.$emit("choose", "e1");
    await wrapper.vm.$nextTick();
    expect(mocks.mutateAsync).not.toHaveBeenCalledWith(expect.objectContaining({ command: "advance" }));
    const dialog = wrapper.findComponent(QuestAdvanceDialog);
    expect(dialog.props("open")).toBe(true);
    expect(dialog.props("preselectedEdgeId")).toBe("e1");
    expect(dialog.props("improvise")).toBe(false);
  });

  it("opens the Advance dialog with its improvise option selected from Something else…", async () => {
    mocks.context.value = runningContext();
    const wrapper = shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    wrapper.findComponent(QuestRunOutcomeStrip).vm.$emit("something-else");
    await wrapper.vm.$nextTick();
    const dialog = wrapper.findComponent(QuestAdvanceDialog);
    expect(dialog.props("open")).toBe(true);
    expect(dialog.props("improvise")).toBe(true);
    expect(dialog.props("preselectedEdgeId")).toBeUndefined();
  });

  it("canonicalizes a refreshed Run URL to the persisted current beat", () => {
    mocks.context.value = runningContext();
    mocks.route.query = { beat: "stale-beat", panel: "notes" };
    shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    expect(mocks.replace).toHaveBeenCalledWith({ query: { beat: "b1", panel: "notes" } });
  });

  it("switches thread by writing ?thread= to the route, not by moving any cursor", () => {
    mocks.context.value = runningContext();
    const wrapper = shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    wrapper.findComponent(QuestThreadBar).vm.$emit("switch", "thread-2");
    expect(mocks.replace).toHaveBeenCalledWith({ query: { thread: "thread-2" } });
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("opens a beat attachment in the lazy contained surface", async () => {
    mocks.context.value = runningContext();
    const wrapper = shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    wrapper.findComponent(QuestRunBeatCard).vm.$emit("open-attachment", {
      id: "a1", beat_id: "b1", quest_id: "q1", campaign_id: "c1",
      attachment_type: "encounter", ref_id: "e1", label: "Ambush",
      target_exists: true, prep_gap: false, compact_detail: null, full_editor_to: "/encounters/e1",
      role: "", is_required: true, metadata: {}, sort_order: 0, created_by: "dm", created_at: "now",
    });
    await wrapper.vm.$nextTick();
    expect((wrapper.vm as unknown as { selectedAttachment: { id: string } | null }).selectedAttachment?.id).toBe("a1");
  });

  it("previews this quest's own audience, never another chain's", async () => {
    mocks.context.value = runningContext();
    mocks.quests.value = [
      { id: "q1", player_visible_to: ["anchor-player"] },
      { id: "q2", player_visible_to: ["side-player"] },
    ];
    const wrapper = shallowMount(QuestRunCockpit, {
      props: { anchorQuestId: "q1", visibleTo: [] },
    });
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Preview as players")!.trigger("click");
    await wrapper.vm.$nextTick();
    const preview = wrapper.findComponent(QuestPlayerPreviewDrawer);
    // The cockpit used to follow a campaign-wide cursor, so a beat from q2 could
    // be current here and the preview would silently switch audience with it.
    expect(preview.props("questId")).toBe("q1");
    expect(preview.props("visibleTo")).toEqual(["anchor-player"]);
  });

  it("renders the current beat from the live beat row after an in-place save", () => {
    mocks.context.value = runningContext();
    mocks.beats.value = [{ ...beat, title: "Saved at the table", visibility: "revealed" }];
    const wrapper = shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    expect(wrapper.findComponent(QuestRunBeatCard).props("beat")).toEqual(expect.objectContaining({
      title: "Saved at the table",
      visibility: "revealed",
    }));
  });

  // #868 S12: `staged_at_location_id` now legitimately names a room, not only
  // a site — the crawl's own opening point. The handoff must still gate on
  // exactly the same condition (the SITE the room belongs to has rooms).
  it("mounts the site handoff when the current beat is staged at a room, not only at a site directly", () => {
    mocks.context.value = runningContext();
    mocks.beats.value = [{ ...beat, staged_at_location_id: "room-1" }];
    mocks.locations.value = [
      { id: "site-1", parent_id: null, location_type: "dungeon" },
      { id: "room-1", parent_id: "site-1", location_type: "room" },
    ];
    const wrapper = shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    expect(wrapper.findComponent({ name: "QuestSiteHandoff" }).exists()).toBe(true);
    expect(wrapper.findComponent(QuestRunBeatCard).exists()).toBe(false);
  });

  it("does not mount the site handoff for a beat staged at a non-site location", () => {
    mocks.context.value = runningContext();
    mocks.beats.value = [{ ...beat, staged_at_location_id: "town-1" }];
    mocks.locations.value = [{ id: "town-1", parent_id: null, location_type: "town" }];
    const wrapper = shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    expect(wrapper.findComponent({ name: "QuestSiteHandoff" }).exists()).toBe(false);
    expect(wrapper.findComponent(QuestRunBeatCard).exists()).toBe(true);
  });

  it("reveals the current beat without moving the runtime cursor", async () => {
    mocks.context.value = runningContext();
    mocks.beats.value = [{ ...beat, visibility: "hidden", updated_at: "version-1" }];
    mocks.updateBeat.mockResolvedValue({ ...beat, visibility: "revealed", updated_at: "version-2" });
    const wrapper = shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    wrapper.findComponent(QuestRunBeatCard).vm.$emit("reveal");
    await flushPromises();
    expect(mocks.updateBeat).toHaveBeenCalledWith({
      id: "b1", questId: "q1", expectedUpdatedAt: "version-1", update: { visibility: "revealed" },
    });
    expect(mocks.mutateAsync).not.toHaveBeenCalled();
  });

  it("falls back to the passed audience while the quest list is still loading", async () => {
    mocks.context.value = runningContext();
    mocks.quests.value = [];
    const wrapper = shallowMount(QuestRunCockpit, {
      props: { anchorQuestId: "q1", visibleTo: ["anchor-player"] },
    });
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Preview as players")!.trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(QuestPlayerPreviewDrawer).props("visibleTo")).toEqual(["anchor-player"]);
  });

  it("defaults to the quest's oldest live thread and passes it through to every runtime command", async () => {
    mocks.context.value = runningContext();
    const wrapper = shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    wrapper.findComponent(QuestRunSessionPanel).vm.$emit("previous");
    await wrapper.vm.$nextTick();
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ threadId: "thread-1" }));
  });

  it("lists the other chains the party has open, and never this one", () => {
    mocks.context.value = runningContext();
    mocks.liveQuests.value = [
      { quest_id: "q1", quest_title: "This chain", beat_title: "Opening", runtime_status: "running" },
      { quest_id: "q2", quest_title: "Murder mystery", beat_title: "Who is the killer", runtime_status: "paused" },
    ];
    const wrapper = shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    expect(wrapper.findComponent(QuestRunOpenChains).props("chains")).toEqual([
      expect.objectContaining({ quest_id: "q2", runtime_status: "paused" }),
    ]);
  });
});
