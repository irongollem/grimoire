// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NoticeBoardNewView from "./NoticeBoardNewView.vue";

const mocks = vi.hoisted(() => ({ push: vi.fn(), create: vi.fn(), campaignId: "camp-1" as string | null }));

vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: ref(mocks.campaignId) }) }));
vi.mock("@/composables/noticeBoards/useNoticeBoards", () => ({
  useCreateNoticeBoard: () => ({ mutateAsync: mocks.create }),
}));

const stubs = { PageHeader: { template: "<div><slot name='actions' /><slot /></div>" } };
const mountView = () => mount(NoticeBoardNewView, { global: { plugins: [createPinia()], stubs, directives: { "no-pwm": {} } } });
const find = (w: ReturnType<typeof mountView>, text: string) => w.findAll("button").find((b) => b.text() === text);

describe("NoticeBoardNewView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mocks.campaignId = "camp-1";
    mocks.create.mockResolvedValue({ id: "board-1" });
  });

  it("cannot create a board with no name", () => {
    expect(find(mountView(), "Create")?.attributes("disabled")).toBeDefined();
  });

  it("creates the board on the chosen surface and returns to the list", async () => {
    const w = mountView();
    await w.get("input").setValue("The Notice Board at The Pulled Sugar Inn");
    await w.get('[data-surface="planks"]').trigger("click");
    await find(w, "Create")?.trigger("click");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith({
      campaign_id: "camp-1",
      name: "The Notice Board at The Pulled Sugar Inn",
      surface: "planks",
    });
    expect(mocks.push).toHaveBeenCalledWith("/dungeon-craft?tab=notice-boards");
  });

  it("starts on cork, the tavern board", async () => {
    const w = mountView();
    expect(w.get('[data-surface="cork"]').attributes("aria-checked")).toBe("true");
  });

  it("shows why it cannot create when no campaign is active", () => {
    mocks.campaignId = null;
    const w = mountView();
    expect(w.text()).toContain("Pick a campaign first");
    expect(find(w, "Create")?.attributes("disabled")).toBeDefined();
  });

  it("surfaces a failed create and stays put", async () => {
    mocks.create.mockRejectedValueOnce(new Error("quota"));
    const w = mountView();
    await w.get("input").setValue("A board");
    await find(w, "Create")?.trigger("click");
    await flushPromises();
    expect(w.get('[role="alert"]').text()).toBe("quota");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
