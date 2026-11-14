import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref } from "vue";
import QuestBeatColumn from "./QuestBeatColumn.vue";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), ai: true, thread: undefined as string | undefined, transitions: [] as Array<{ to_beat_id: string | null }>, context: null as unknown, b1: {} as Record<string, unknown> }));

vi.mock("vue-router", () => ({ useRoute: () => ({ query: mocks.thread ? { thread: mocks.thread } : {} }), useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1", get isAiEnabled() { return mocks.ai; } }) }));
vi.mock("@/composables/quests/useQuests", () => ({ useQuestObjectives: () => ({ data: ref([]) }) }));
vi.mock("@/composables/useHotkeys", () => ({ useHotkeys: vi.fn() }));
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestBeats: () => ({ data: ref([
    { id: "b1", title: "Gate", kind: "scene", visibility: "hidden", secret: false, read_aloud: null, dm_content: null, how_it_plays: null, updated_at: "t", ...mocks.b1 },
    { id: "b2", title: "Crypt", kind: "scene", visibility: "hidden", secret: false, read_aloud: null, dm_content: null, how_it_plays: null, updated_at: "t" },
  ]) }),
  useQuestBeatEdges: () => ({ data: ref([{ id: "e1", source_beat_id: "b1", target_beat_id: "b2", route_kind: "choice", label: "Down", note: null }]) }),
  useQuestBeatTransitionsForQuest: () => ({ data: ref(mocks.transitions) }),
  useQuestRuntimeContext: () => ({ data: ref(mocks.context) }),
}));
vi.mock("@/lib/quests/beatText", () => ({ hasBeatText: (v: string | null | undefined) => !!v }));
vi.mock("@/lib/quests/threads", () => ({ threadBadge: () => null, threadTone: () => "t" }));

const text = (c: string) => defineComponent({ props: ["content"], setup: (p) => () => h("div", { "data-testid": c }, String(p.content)) });
const Marks = defineComponent({ props: ["floor", "beat"], setup: (p) => () => h("div", { "data-testid": "marks", "data-floor": p.floor }) });
const Fields = defineComponent({ props: ["fillContext"], setup: (p) => () => h("div", { "data-testid": "fields", "data-fill": p.fillContext ? "yes" : "no" }) });
const ThreadBar = defineComponent({ props: ["threadId"], emits: ["switch"], setup: (p, { emit }) => () => h("button", { "data-testid": "threads", onClick: () => emit("switch", "t9") }, p.threadId) });
const Dialog = defineComponent({ props: ["preselectedEdgeId"], setup: (p) => () => h("div", { "data-testid": "dialog", "data-edge": p.preselectedEdgeId }) });

function mountColumn(props: Record<string, unknown> = {}) {
  return mount(QuestBeatColumn, {
    props: {
      questId: "q1", beatId: "b1", quest: null, threads: [], focusThreadId: "t1",
      currentBeatIdByThread: { t1: null }, presentations: {}, entryBeatId: null, ...props,
    },
    global: { stubs: { QuestBeatMarks: Marks, QuestBeatFields: Fields, QuestAdvanceDialog: Dialog, QuestThreadBar: ThreadBar, RichTextViewer: text("rt") } },
  });
}

beforeEach(() => { mocks.replace.mockClear(); mocks.ai = true; mocks.thread = undefined; mocks.transitions = []; mocks.context = null; mocks.b1 = {}; });

describe("QuestBeatColumn", () => {
  // Fails if the floor ignores the transitions, letting a beat the party has stood on be hidden again.
  it("passes a revealed floor to the marks for a beat the party reached", () => {
    mocks.transitions = [{ to_beat_id: "b1" }];
    expect(mountColumn().get('[data-testid="marks"]').attributes("data-floor")).toBe("revealed");
  });

  // Fails if the party's cursor is not counted: a beat one route ahead of the party is rumored at least.
  it("passes a rumored floor to the marks for a beat one route ahead of the party", () => {
    const wrapper = mountColumn({ beatId: "b2", currentBeatIdByThread: { t1: "b1" } });
    expect(wrapper.get('[data-testid="marks"]').attributes("data-floor")).toBe("rumored");
  });

  it("leaves the floor at hidden for a beat nobody has reached", () => {
    expect(mountColumn({ beatId: "b2" }).get('[data-testid="marks"]').attributes("data-floor")).toBe("hidden");
  });

  // Fails if "How it plays" renders its heading for an empty column, or the read-aloud loses its own box.
  it("reads read-aloud, description and how it plays in order, each only when written", () => {
    mocks.b1 = { read_aloud: "RA", dm_content: "DESC" };
    const wrapper = mountColumn();
    expect(wrapper.find('section[aria-label="Read aloud"]').text()).toBe("RA");
    expect(wrapper.text()).toContain("DESC");
    expect(wrapper.text()).not.toContain("How it plays");
    expect(wrapper.text()).not.toContain("Nothing written");
  });

  it("with no text, invites to write it, and Write it opens the form", async () => {
    const wrapper = mountColumn();
    expect(wrapper.text()).toContain("Nothing written");
    await wrapper.findAll("button").find((b) => b.text() === "Write it")!.trigger("click");
    expect(wrapper.find('[data-testid="fields"]').exists()).toBe(true);
  });

  // Fails if Edit text and Done do not switch between reading and the form.
  it("Edit text shows the form and Done returns to reading", async () => {
    const wrapper = mountColumn();
    expect(wrapper.find('[data-testid="fields"]').exists()).toBe(false);
    await wrapper.findAll("button").find((b) => b.text() === "Edit text")!.trigger("click");
    expect(wrapper.find('[data-testid="fields"]').exists()).toBe(true);
    expect(wrapper.emitted("update:editing")?.at(-1)).toEqual([true]);
    await wrapper.findAll("button").find((b) => b.text() === "Done")!.trigger("click");
    expect(wrapper.emitted("update:editing")?.at(-1)).toEqual([false]);
  });

  it("the close button emits deselect", async () => {
    const wrapper = mountColumn();
    await wrapper.get('button[aria-label="Back to the quest"]').trigger("click");
    expect(wrapper.emitted("deselect")).toHaveLength(1);
  });

  // Fails if Take is offered on a beat the party is not at.
  it("offers Take only where the party stands and the run can advance", async () => {
    expect(mountColumn().findAll("button").some((b) => b.text() === "Take")).toBe(false);
    mocks.context = { state: { status: "running" }, current: { id: "b1" }, outgoing: [] };
    const wrapper = mountColumn({ currentBeatIdByThread: { t1: "b1" } });
    await wrapper.findAll("button").find((b) => b.text() === "Take")!.trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="dialog"]').attributes("data-edge")).toBe("e1");
  });

  it("does not offer Take when the party is here but the run is not running", () => {
    mocks.context = { state: { status: "paused" }, current: { id: "b1" }, outgoing: [] };
    expect(mountColumn({ currentBeatIdByThread: { t1: "b1" } }).findAll("button").some((b) => b.text() === "Take")).toBe(false);
  });

  // Fails if a quest with several threads has no way to pick which one the beat is read for.
  it("shows the thread switcher only with two or more threads, and switching rewrites the URL's thread", async () => {
    expect(mountColumn().find('[data-testid="threads"]').exists()).toBe(false);
    const threads = [{ id: "t1" }, { id: "t2" }];
    mocks.thread = "t2";
    const wrapper = mountColumn({ threads });
    expect(wrapper.get('[data-testid="threads"]').text()).toBe("t2");
    await wrapper.get('[data-testid="threads"]').trigger("click");
    expect(mocks.replace).toHaveBeenCalledWith({ query: { thread: "t9" } });
  });

  // Fails if the AI fill bar is never offered in writing mode, or offered with AI off.
  it("gives the text form a fill context only when AI is on and the quest is known", async () => {
    const quest = { id: "q1" };
    const writing = async (props: Record<string, unknown>) => {
      const wrapper = mountColumn(props);
      await wrapper.findAll("button").find((b) => b.text() === "Write it")!.trigger("click");
      return wrapper.get('[data-testid="fields"]').attributes("data-fill");
    };
    expect(await writing({ quest })).toBe("yes");
    expect(await writing({ quest: null })).toBe("no");
    mocks.ai = false;
    expect(await writing({ quest })).toBe("no");
  });

  // Fails if the wide part cannot open the advance dialog through the column.
  it("exposes openAdvance, which opens the dialog where the party stands", async () => {
    mocks.context = { state: { status: "running" }, current: { id: "b1" }, outgoing: [] };
    const wrapper = mountColumn({ currentBeatIdByThread: { t1: "b1" } });
    (wrapper.vm as unknown as { openAdvance: () => void }).openAdvance();
    await flushPromises();
    expect(wrapper.find('[data-testid="dialog"]').exists()).toBe(true);
  });
});
