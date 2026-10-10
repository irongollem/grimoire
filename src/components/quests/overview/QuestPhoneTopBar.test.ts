import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import QuestPhoneTopBar from "./QuestPhoneTopBar.vue";

const mocks = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }));
vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRouter: () => ({ back: mocks.back, push: mocks.push }),
}));

describe("QuestPhoneTopBar", () => {
  it("shows the title and subtitle and hides from md", () => {
    const wrapper = mount(QuestPhoneTopBar, { props: { title: "The Tithe of Ashmouth", subtitle: "Session live · Thread A" } });
    expect(wrapper.text()).toContain("The Tithe of Ashmouth");
    expect(wrapper.text()).toContain("Session live · Thread A");
    expect(wrapper.get("header").classes()).toContain("md:hidden");
  });

  it("goes back through history when there is one, else to the fallback", async () => {
    const wrapper = mount(QuestPhoneTopBar, { props: { title: "x", fallbackTo: "/quests" } });
    Object.defineProperty(window.history, "length", { value: 1, configurable: true });
    await wrapper.get('button[aria-label="Back"]').trigger("click");
    expect(mocks.push).toHaveBeenCalledWith("/quests");
  });
});
