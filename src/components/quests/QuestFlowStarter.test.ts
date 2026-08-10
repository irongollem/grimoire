import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestFlowStarter from "./QuestFlowStarter.vue";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@/composables/useQuests", () => ({
  useCreateQuest: () => ({ mutateAsync: mocks.create }),
}));
vi.mock("vue-router", async (importOriginal) => ({
  ...await importOriginal<typeof import("vue-router")>(),
  useRouter: () => ({ push: mocks.push }),
}));

describe("QuestFlowStarter", () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.push.mockReset();
  });

  it("creates a flow-enabled quest shell and opens its graph", async () => {
    mocks.create.mockResolvedValue({ id: "quest-new" });
    const wrapper = mount(QuestFlowStarter, {
      props: { parentId: "parent-1" },
      global: { stubs: { RouterLink: RouterLinkStub } },
    });

    await wrapper.findAll("input")[0]!.setValue("  The Sunken Road  ");
    await wrapper.findAll("input")[1]!.setValue("Follow the bells below the lake.");
    await wrapper.get('button[aria-label="Create and build flow"]').trigger("click");
    await flushPromises();

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      parent_quest_id: "parent-1",
      title: "The Sunken Road",
      summary: "Follow the bells below the lake.",
      status: "undiscovered",
    }));
    expect(mocks.push).toHaveBeenCalledWith({ path: "/quests/quest-new", query: { mode: "build" } });
  });

  it("keeps creation failures in context", async () => {
    mocks.create.mockRejectedValue(new Error("Quest insert failed"));
    const wrapper = mount(QuestFlowStarter, { global: { stubs: { RouterLink: RouterLinkStub } } });
    await wrapper.findAll("input")[0]!.setValue("Broken road");
    await wrapper.get('button[aria-label="Create and build flow"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain("Quest insert failed");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
