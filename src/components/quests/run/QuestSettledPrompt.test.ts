import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestSettledPrompt from "./QuestSettledPrompt.vue";

const mocks = vi.hoisted(() => ({
  status: "active",
  statuses: ["complete", "failed"] as string[],
  update: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: mocks.error, success: vi.fn(), fromError: String }) }));
vi.mock("@/composables/quests/useQuests", () => ({
  useQuest: () => ({ data: ref({ id: "q1", status: mocks.status }) }),
  useQuestObjectives: () => ({ data: ref(mocks.statuses.map((status, i) => ({ id: `o${i}`, status }))) }),
  useUpdateQuest: () => ({ mutateAsync: mocks.update }),
}));

describe("QuestSettledPrompt", () => {
  beforeEach(() => {
    mocks.status = "active";
    mocks.statuses = ["complete", "failed"];
    mocks.update.mockReset();
    mocks.error.mockReset();
  });

  it("asks when an active quest's ledger has settled", async () => {
    const wrapper = mount(QuestSettledPrompt, { props: { questId: "q-ask" } });
    expect(wrapper.text()).toContain("Every objective is resolved.");
    await wrapper.findAll("button").find((b) => b.text() === "Mark completed")?.trigger("click");
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({ id: "q-ask", update: { status: "completed" } });
  });

  it("stays quiet while something is pending, or once the quest is no longer active", () => {
    mocks.statuses = ["complete", "pending"];
    expect(mount(QuestSettledPrompt, { props: { questId: "q-open" } }).text()).toBe("");
    mocks.statuses = ["complete"];
    mocks.status = "completed";
    expect(mount(QuestSettledPrompt, { props: { questId: "q-done" } }).text()).toBe("");
  });

  it("Keep running dismisses it for that quest", async () => {
    const wrapper = mount(QuestSettledPrompt, { props: { questId: "q-keep" } });
    await wrapper.findAll("button").find((b) => b.text() === "Keep running")?.trigger("click");
    expect(wrapper.text()).toBe("");
  });

  it("Mark failed records the quest as failed", async () => {
    const wrapper = mount(QuestSettledPrompt, { props: { questId: "q-fail" } });
    await wrapper.findAll("button").find((b) => b.text() === "Mark failed")?.trigger("click");
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({ id: "q-fail", update: { status: "failed" } });
  });

  it("a refused update is toasted and the buttons come back", async () => {
    mocks.update.mockRejectedValue(new Error("Not allowed"));
    const wrapper = mount(QuestSettledPrompt, { props: { questId: "q-refused" } });
    await wrapper.findAll("button").find((b) => b.text() === "Mark completed")?.trigger("click");
    await flushPromises();
    expect(mocks.error).toHaveBeenCalledWith("Error: Not allowed");
    expect(wrapper.findAll("button").find((b) => b.text() === "Mark completed")?.attributes("disabled")).toBeUndefined();
  });

  it("keeping one quest running does not silence the prompt for another quest", async () => {
    const first = mount(QuestSettledPrompt, { props: { questId: "q-silenced" } });
    await first.findAll("button").find((b) => b.text() === "Keep running")?.trigger("click");
    expect(first.text()).toBe("");
    expect(mount(QuestSettledPrompt, { props: { questId: "q-other" } }).text()).toContain("Every objective is resolved.");
  });
});
