import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestBeatVisibilityControl from "./QuestBeatVisibilityControl.vue";
import type { QuestBeat } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({ setVisibility: vi.fn(), setAudience: vi.fn(), toastError: vi.fn() }));
vi.mock("@/composables/quests/useSetBeatAudience", () => ({ useSetBeatAudience: () => mocks.setAudience }));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({ data: { value: [{ id: "m1", name: "Brannigan" }, { id: "m2", name: "Edda" }, { id: "m3", name: "Corin" }] } }),
}));
vi.mock("@/composables/quests/useSetBeatVisibility", () => ({ useSetBeatVisibility: () => mocks.setVisibility }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: mocks.toastError, fromError: String }) }));

const beat = { id: "b1", quest_id: "q1", visibility: "hidden", visible_to: null, updated_at: "t0" } as QuestBeat;
const dot = (wrapper: ReturnType<typeof mount>, step: string) =>
  wrapper.findAll("button").find((b) => b.attributes("aria-label") === step)!;

beforeEach(() => vi.clearAllMocks());

const whoButton = (wrapper: ReturnType<typeof mount>) => wrapper.findAll("button").find((b) => b.attributes("aria-haspopup") === "dialog")!;
async function openWho(props: { beat: QuestBeat }) {
  const wrapper = mount(QuestBeatVisibilityControl, { props, attachTo: document.body });
  await whoButton(wrapper).trigger("click");
  return wrapper;
}
const box = (label: string) => {
  const input = [...document.body.querySelectorAll("label")].find((l) => l.textContent?.trim() === label)?.querySelector("input");
  if (!input) throw new Error(`no checkbox ${label}`);
  return input;
};

describe("QuestBeatVisibilityControl", () => {
  // Fails if picking a step stops reaching the one visibility write, with the beat as it was read.
  it("writes the step the DM picks", async () => {
    mocks.setVisibility.mockResolvedValue(undefined);
    await dot(mount(QuestBeatVisibilityControl, { props: { beat } }), "revealed").trigger("click");
    expect(mocks.setVisibility).toHaveBeenCalledWith(expect.objectContaining({ id: "b1", updated_at: "t0" }), "revealed");
  });

  // Fails if the floor is not handed to the circles, letting a beat the party reached be hidden again.
  it("writes nothing below the floor", async () => {
    const wrapper = mount(QuestBeatVisibilityControl, { props: { beat: { ...beat, visibility: "revealed" }, floor: "revealed" } });
    expect(dot(wrapper, "hidden").attributes("disabled")).toBeDefined();
    await dot(wrapper, "hidden").trigger("click");
    expect(mocks.setVisibility).not.toHaveBeenCalled();
  });

  // Fails if a refused write disappears silently instead of telling the DM.
  it("says so when the write fails", async () => {
    mocks.setVisibility.mockRejectedValue(new Error("nope"));
    await dot(mount(QuestBeatVisibilityControl, { props: { beat } }), "rumored").trigger("click");
    await Promise.resolve(); await Promise.resolve();
    expect(mocks.toastError).toHaveBeenCalled();
  });

  // Fails if the who-label stops reading "Whole party" for null or stops naming members.
  it("says who the beat is shown to", () => {
    expect(whoButton(mount(QuestBeatVisibilityControl, { props: { beat } })).text()).toBe("Whole party");
    expect(whoButton(mount(QuestBeatVisibilityControl, { props: { beat: { ...beat, visible_to: ["m1"] } } })).text()).toBe("Brannigan");
    expect(whoButton(mount(QuestBeatVisibilityControl, { props: { beat: { ...beat, visible_to: ["m1", "m2"] } } })).text()).toBe("Brannigan and Edda");
    expect(whoButton(mount(QuestBeatVisibilityControl, { props: { beat: { ...beat, visible_to: ["m1", "m2", "m3"] } } })).text()).toBe("3 of 3");
  });

  // Fails if picking one member from the whole party writes anything but exactly the others-excluded list.
  it("writes the members the DM leaves ticked", async () => {
    mocks.setAudience.mockResolvedValue(undefined);
    const wrapper = await openWho({ beat });
    box("Edda").click();
    await Promise.resolve();
    expect(mocks.setAudience).toHaveBeenCalledWith(expect.objectContaining({ id: "b1" }), ["m1", "m3"]);
    wrapper.unmount();
  });

  // Fails if "Whole party" writes a list instead of null.
  it("writes null for the whole party", async () => {
    mocks.setAudience.mockResolvedValue(undefined);
    const wrapper = await openWho({ beat: { ...beat, visible_to: ["m1"] } });
    box("Whole party").click();
    await Promise.resolve();
    expect(mocks.setAudience).toHaveBeenCalledWith(expect.objectContaining({ id: "b1" }), null);
    wrapper.unmount();
  });

  // Fails if the last ticked member can be unticked, which would show the beat to no one (an empty array).
  it("never writes an empty audience", async () => {
    const wrapper = await openWho({ beat: { ...beat, visible_to: ["m1"] } });
    expect(box("Brannigan").disabled).toBe(true);
    box("Brannigan").click();
    await Promise.resolve();
    expect(mocks.setAudience).not.toHaveBeenCalled();
    wrapper.unmount();
  });
});
