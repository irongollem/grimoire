import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestRunCockpit from "./QuestRunCockpit.vue";
import QuestRunControls from "./QuestRunControls.vue";
import QuestRunJumpPanel from "./QuestRunJumpPanel.vue";

const mocks = vi.hoisted(() => ({
  context: { value: null as Record<string, unknown> | null },
  beats: { value: [] as Array<Record<string, unknown>> },
  targets: { value: [] as Array<Record<string, unknown>> },
  quests: { value: [] as Array<Record<string, unknown>> },
  mutateAsync: vi.fn(),
  updateBeat: vi.fn(),
  createBeat: vi.fn(),
  deleteBeat: vi.fn(),
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
  useCreateQuestBeat: () => ({ mutateAsync: mocks.createBeat }),
  useDeleteQuestBeat: () => ({ mutateAsync: mocks.deleteBeat }),
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
    mocks.route.query = { mode: "run" };
    mocks.mutateAsync.mockReset();
    mocks.mutateAsync.mockImplementation(async () => mocks.context.value);
    mocks.refetch.mockReset();
    mocks.replace.mockReset();
    mocks.updateBeat.mockReset();
    mocks.createBeat.mockReset();
    mocks.deleteBeat.mockReset();
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
    mocks.route.query = { mode: "run", beat: "stale-beat", panel: "notes" };
    shallowMount(QuestRunCockpit, { props: { anchorQuestId: "q1" } });
    expect(mocks.replace).toHaveBeenCalledWith({ query: { mode: "run", beat: "b1", panel: "notes" } });
  });
});
