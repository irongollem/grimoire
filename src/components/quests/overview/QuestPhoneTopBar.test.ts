import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import QuestPhoneTopBar from "./QuestPhoneTopBar.vue";

const mocks = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }));
vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRouter: () => ({ back: mocks.back, push: mocks.push }),
}));

describe("QuestPhoneTopBar", () => {
  const originalLength = window.history.length;
  afterEach(() => {
    Object.defineProperty(window.history, "length", { value: originalLength, configurable: true });
    mocks.back.mockClear();
    mocks.push.mockClear();
  });
  const setHistory = (length: number) => Object.defineProperty(window.history, "length", { value: length, configurable: true });

  it("shows the title and the subtitle it is given", () => {
    const wrapper = mount(QuestPhoneTopBar, { props: { title: "The Tithe of Ashmouth", subtitle: "Session live · Thread A" } });
    expect(wrapper.text()).toContain("The Tithe of Ashmouth");
    expect(wrapper.text()).toContain("Session live · Thread A");
  });

  it("Back returns through history when there is some to return to", async () => {
    setHistory(2);
    const wrapper = mount(QuestPhoneTopBar, { props: { title: "x" } });
    await wrapper.get('button[aria-label="Back"]').trigger("click");
    expect(mocks.back).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("Back goes to the given fallback when the page was opened cold, and to the quest board when none is given", async () => {
    setHistory(1);
    const custom = mount(QuestPhoneTopBar, { props: { title: "x", fallbackTo: "/quests/q1" } });
    await custom.get('button[aria-label="Back"]').trigger("click");
    expect(mocks.push).toHaveBeenLastCalledWith("/quests/q1");
    const plain = mount(QuestPhoneTopBar, { props: { title: "x" } });
    await plain.get('button[aria-label="Back"]').trigger("click");
    expect(mocks.push).toHaveBeenLastCalledWith("/quests");
    expect(mocks.back).not.toHaveBeenCalled();
  });
});
