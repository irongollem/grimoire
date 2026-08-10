import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestRunCockpit from "./QuestRunCockpit.vue";
import QuestRunControls from "./QuestRunControls.vue";
import QuestRunJumpPanel from "./QuestRunJumpPanel.vue";
import QuestRunBeatCard from "./QuestRunBeatCard.vue";
import QuestPlayerPreviewDrawer from "./QuestPlayerPreviewDrawer.vue";

const mocks = vi.hoisted(() => ({
  context: { value: null as Record<string, unknown> | null },
  beats: { value: [] as Array<Record<string, unknown>> },
  targets: { value: [] as Array<Record<string, unknown>> },
  quests: { value: [] as Array<Record<string, unknown>> },
  mutateAsync: vi.fn(),
  updateBeat: vi.fn(),
  improvise: vi.fn(),
  refetch: vi.fn(),
  replace: vi.fn(),
  route: { query: { mode: "run" } as Record<string, string> },
}));

vi.mock("vue-router", () => ({ useRoute: () => mocks.route, useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: vi.fn(async () => true) }) }));
vi.mock("@/composables/useHotkeys", () => ({ useHotkeys: vi.fn() }));
vi.mock("@/composables/useQuests", () => ({ useQuests: () => ({ data: mocks.quests }) }));
vi.mock("@/composables/useQuestFlow", () => ({
  useQuestRuntimeContext: () => ({ data: mocks.context, isLoading: { value: false }, error: { value: null }, refetch: mocks.refetch }),
  useQuestRuntimeCommand: () => ({ mutateAsync: mocks.mutateAsync }),
  useQuestBeats: () => ({ data: mocks.beats }),
  useQuests: () => ({ data: mocks.quests }),
  useQuestBeatAttachmentSummaries: () => ({ data: { value: [] } }),
  useQuestBeatLoot: () => ({ data: { value: [] } }),
  useQuestRuntimeJumpTargets: () => ({ data: mocks.targets }),
  useUpdateQuestBeat: () => ({ mutateAsync: mocks.updateBeat }),
  useQuestRuntimeImprovise: () => ({ mutateAsync: mocks.improvise }),
}));

const beat = { id: "b1", quest_id: "q1", campaign_id: "c1", title: "Opening", kind: "social" };
const runningContext = () => ({
  state: { campaign_id: "c1", current_quest_id: "q1", current_beat_id: "b1", status: "running", version: 4 },
  current: beat,
  previous: { quest_id: "q1", beat_id: "b0" },
  outgoing: [{ edge_id: "e1", quest_id: "q1", beat_id: "b2", label: "Continue", beat_title: "Next", beat_kind: "neutral" }],
  return_target: null,
  path_so_far: [],
});

describe("QuestRunCockpit", () => {
  beforeEach(() => {
    mocks.context.value = null;
    mocks.beats.value = [beat];
    mocks.targets.value = [];
    mocks.quests.value = [];
    mocks.route.query = {};
    mocks.mutateAsync.mockReset();
    mocks.mutateAsync.mockImplementation(async () => mocks.context.value);
    mocks.refetch.mockReset();
    mocks.replace.mockReset();
    mocks.updateBeat.mockReset();
    mocks.improvise.mockReset();
  });

  it("starts the selected beat with version zero", async () => {
    const wrapper = shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    wrapper.findComponent({ name: "EntityCombobox" }).vm.$emit("update:modelValue", "b1");
    await wrapper.vm.$nextTick();
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Start run")!.trigger("click");
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ command: "start", expectedVersion: 0, targetBeatId: "b1" }));
  });

  it("routes previous, branch, pause, resume, and jump through versioned commands", async () => {
    mocks.context.value = runningContext();
    const wrapper = shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    const controls = wrapper.findComponent(QuestRunControls);
    controls.vm.$emit("previous");
    controls.vm.$emit("advance", "e1");
    controls.vm.$emit("pause");
    await wrapper.vm.$nextTick();
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ command: "previous", expectedVersion: 4 }));
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ command: "advance", edgeId: "e1" }));
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ command: "pause" }));
    await flushPromises();

    controls.vm.$emit("jump");
    await wrapper.vm.$nextTick();
    wrapper.findComponent(QuestRunJumpPanel).vm.$emit("jump", { quest_id: "q2", beat_id: "b9" }, "A detour", true);
    await wrapper.vm.$nextTick();
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ command: "jump", targetQuestId: "q2", targetBeatId: "b9", pushReturn: true }));

    mocks.context.value = { ...runningContext(), state: { ...runningContext().state, status: "paused" } };
    const paused = shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    paused.findComponent(QuestRunControls).vm.$emit("resume");
    expect(mocks.mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ command: "resume" }));
  });

  it("canonicalizes a refreshed Run URL to the persisted current beat", () => {
    mocks.context.value = runningContext();
    mocks.route.query = { beat: "stale-beat", panel: "notes" };
    shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    expect(mocks.replace).toHaveBeenCalledWith({ query: { beat: "b1", panel: "notes" } });
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

  it("uses the current side quest's sharing audience for player preview", async () => {
    const sideBeat = { ...beat, id: "side-beat", quest_id: "q2", title: "Side road" };
    mocks.context.value = {
      ...runningContext(),
      state: { ...runningContext().state, current_quest_id: "q2", current_beat_id: "side-beat" },
      current: sideBeat,
    };
    mocks.beats.value = [sideBeat];
    mocks.quests.value = [
      { id: "q1", player_visible_to: ["anchor-player"] },
      { id: "q2", player_visible_to: ["side-player"] },
    ];
    const wrapper = shallowMount(QuestRunCockpit, {
      props: { anchorQuestId: "q1", visibleTo: ["anchor-player"] },
    });
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Preview as players")!.trigger("click");
    await wrapper.vm.$nextTick();
    const preview = wrapper.findComponent(QuestPlayerPreviewDrawer);
    expect(preview.props("questId")).toBe("q2");
    expect(preview.props("visibleTo")).toEqual(["side-player"]);
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

  it("offers no audience when the previewed side quest no longer resolves", async () => {
    const missingBeat = { ...beat, id: "missing-beat", quest_id: "missing-quest" };
    mocks.context.value = { ...runningContext(), current: missingBeat };
    mocks.beats.value = [missingBeat];
    mocks.quests.value = [{ id: "q1", player_visible_to: ["anchor-player"] }];
    const wrapper = shallowMount(QuestRunCockpit, {
      props: { anchorQuestId: "q1", visibleTo: ["anchor-player"] },
    });
    await wrapper.findAllComponents({ name: "AppButton" }).find((button) => button.props("label") === "Preview as players")!.trigger("click");
    await wrapper.vm.$nextTick();
    expect(wrapper.findComponent(QuestPlayerPreviewDrawer).props("visibleTo")).toEqual([]);
  });
});
