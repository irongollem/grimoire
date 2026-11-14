import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestBeatWideRead from "./QuestBeatWideRead.vue";
import type { QuestBeat, QuestBeatEdge } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({ setVisibility: vi.fn(), updateBeat: vi.fn() }));
vi.mock("@/composables/party/useParty", () => ({ useParty: () => ({ data: { value: [] } }) }));
vi.mock("@/composables/quests/useSetBeatVisibility", () => ({ useSetBeatVisibility: () => mocks.setVisibility }));
vi.mock("@/composables/quests/useQuestFlow", () => ({ useUpdateQuestBeat: () => ({ mutateAsync: mocks.updateBeat }) }));

const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
function beat(overrides: Partial<QuestBeat> = {}): QuestBeat {
  return {
    id: "beat-1", quest_id: "quest-1", campaign_id: "campaign-1", title: "Naerth", secret: false, visible_to: null, visibility: "hidden",
    rumor_text: doc("The Speaker takes an interest."), reveal_text: doc("Speaker Naerth welcomed us."), updated_at: "v1",
    ...overrides,
  } as QuestBeat;
}
const edges = [{ id: "e-1", source_beat_id: "beat-0", target_beat_id: "beat-1" }] as QuestBeatEdge[];

function mountRead(props: Partial<InstanceType<typeof QuestBeatWideRead>["$props"]> = {}) {
  return mount(QuestBeatWideRead, {
    props: { beat: beat(), edges, reachedBeatIds: new Set<string>(), partyBeatIds: new Set<string>(), ...props },
    global: { stubs: { RichTextViewer: { props: ["content"], template: "<span>{{ content }}</span>" } } },
  });
}

describe("QuestBeatWideRead", () => {
  beforeEach(() => {
    mocks.setVisibility.mockReset().mockResolvedValue(undefined);
    mocks.updateBeat.mockReset().mockResolvedValue(undefined);
  });

  it("says why the beat is revealed when the party is on it", () => {
    const wrapper = mountRead({ beat: beat({ visibility: "revealed" }), partyBeatIds: new Set(["beat-1"]) });
    expect(wrapper.get('[data-testid="floor-line"]').text()).toBe("Revealed on its own: the party is here.");
  });

  it("says the party has been here when it only passed through", () => {
    const wrapper = mountRead({ beat: beat({ visibility: "revealed" }), reachedBeatIds: new Set(["beat-1"]) });
    expect(wrapper.get('[data-testid="floor-line"]').text()).toBe("Revealed on its own: the party has been here.");
  });

  it("says a beat one route from the party is rumored on its own, unless it is secret", () => {
    const near = new Set(["beat-0"]);
    expect(mountRead({ beat: beat({ visibility: "rumored" }), partyBeatIds: near }).get('[data-testid="floor-line"]').text()).toBe("Rumored on its own: one route away.");
    expect(mountRead({ beat: beat({ secret: true }), partyBeatIds: near }).find('[data-testid="floor-line"]').exists()).toBe(false);
  });

  it("says nothing about a floor when the party is nowhere near", () => {
    expect(mountRead().find('[data-testid="floor-line"]').exists()).toBe(false);
  });

  it("will not let the track move below the floor", () => {
    const wrapper = mountRead({ beat: beat({ visibility: "revealed" }), partyBeatIds: new Set(["beat-1"]) });
    expect(wrapper.get('button[aria-label="hidden"]').attributes("disabled")).toBeDefined();
    expect(wrapper.get('button[aria-label="rumored"]').attributes("disabled")).toBeDefined();
  });

  it("moves a beat along the track through the one visibility write", async () => {
    const wrapper = mountRead();
    await wrapper.get('button[aria-label="rumored"]').trigger("click");
    await flushPromises();
    expect(mocks.setVisibility).toHaveBeenCalledWith(expect.objectContaining({ id: "beat-1" }), "rumored");
  });

  it("marks only the slip that matches the current visibility as showing", () => {
    const rumored = mountRead({ beat: beat({ visibility: "rumored" }) });
    expect(rumored.findAll("p").filter((p) => p.text().includes("Showing")).map((p) => p.text())).toEqual(["While rumored Showing"]);
    const revealed = mountRead({ beat: beat({ visibility: "revealed" }) });
    expect(revealed.findAll("p").filter((p) => p.text().includes("Showing")).map((p) => p.text())).toEqual(["Once revealed Showing"]);
    expect(mountRead().text()).not.toContain("Showing");
  });

  it("shows what is written at each step, or says it is not written yet", () => {
    const wrapper = mountRead({ beat: beat({ reveal_text: null }) });
    expect(wrapper.text()).toContain("The Speaker takes an interest.");
    expect(wrapper.text()).toContain("Nothing written yet.");
  });

  it("asks the column for its text form on Edit", async () => {
    const wrapper = mountRead();
    await wrapper.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === "Edit")!.trigger("click");
    expect(wrapper.emitted("edit-text")).toHaveLength(1);
  });

  it("saves Secret as a beat write, and reports a refusal", async () => {
    const wrapper = mountRead();
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await flushPromises();
    expect(mocks.updateBeat).toHaveBeenCalledWith({ id: "beat-1", questId: "quest-1", update: { secret: true } });

    mocks.updateBeat.mockRejectedValueOnce(new Error("refused"));
    await wrapper.setProps({ beat: beat({ secret: true }) });
    await wrapper.get('input[type="checkbox"]').setValue(false);
    await flushPromises();
    expect(mocks.updateBeat).toHaveBeenLastCalledWith({ id: "beat-1", questId: "quest-1", update: { secret: false } });
    expect(wrapper.get('[role="alert"]').text()).toBe("refused");
  });
});
