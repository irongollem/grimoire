import { mount, RouterLinkStub } from "@vue/test-utils";
import { ref } from "vue";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushMicrotasks, useVirtualGridViewport } from "@/components/common/list/virtualGridTestViewport";
import { grellRow, letterRow, pinRow } from "@/components/noticeBoard/editor/pinRows";
import { useDungeonFeaturesUiStore } from "@/stores/ui/dungeonFeatures";
import type { NoticeBoard } from "@/types/noticeBoard.types";
import DungeonCraftNoticeBoardsTab from "./DungeonCraftNoticeBoardsTab.vue";

function board(overrides: Partial<NoticeBoard> = {}): NoticeBoard {
  return {
    id: "board-1",
    user_id: "u1",
    campaign_id: "camp-1",
    name: "The Notice Board at The Pulled Sugar Inn",
    surface: "cork",
    is_revealed: false,
    presented_at: null,
    scatter: [],
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

const mocks = vi.hoisted(() => ({ boards: [] as NoticeBoard[], pins: [] as unknown[], push: vi.fn() }));

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/composables/noticeBoards/useNoticeBoards", () => ({
  useNoticeBoards: () => ({ data: ref(mocks.boards), isLoading: ref(false) }),
  useCampaignNoticeBoardPins: () => ({ data: ref(mocks.pins) }),
}));
// The grid wires bulk scope for every tab, whether or not this one turns it on.
vi.mock("@/composables/campaign/useBulkCampaignScope", () => ({
  useBulkCampaignScope: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
}));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), fromError: (e: unknown) => String(e) }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaign: null, activeCampaignId: null }),
}));

useVirtualGridViewport();

function mountTab() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return mount(DungeonCraftNoticeBoardsTab, {
    global: { plugins: [pinia], stubs: { RouterLink: RouterLinkStub } },
  });
}

const findExact = (w: ReturnType<typeof mountTab>, text: string) => w.findAll("button").find((b) => b.text() === text);

describe("DungeonCraftNoticeBoardsTab", () => {
  beforeEach(() => {
    mocks.boards = [board()];
    mocks.pins = [pinRow(), grellRow(), letterRow({ status: "draft" })];
    mocks.push.mockReset();
  });

  it("links each board to its editor and counts only the notices that are up", async () => {
    const w = mountTab();
    await flushMicrotasks();
    expect(w.text()).toContain("The Notice Board at The Pulled Sugar Inn");
    expect(w.text()).toContain("2 notices up");
    expect(w.findAllComponents(RouterLinkStub).map((l) => l.props("to"))).toContain("/notice-boards/board-1");
  });

  it("previews the board with its up pins and never its drafts", async () => {
    const w = mountTab();
    await flushMicrotasks();
    const preview = w.get("[data-board-preview]");
    expect(preview.findAll("[data-pin]")).toHaveLength(2);
    expect(preview.attributes("inert")).toBeDefined();
  });

  it("marks a board shown to players, and one being presented", async () => {
    mocks.boards = [board({ is_revealed: true }), board({ id: "board-2", name: "Frontier Board", is_revealed: true, presented_at: "2026-10-16T20:00:00Z" })];
    const w = mountTab();
    await flushMicrotasks();
    expect(w.text()).toContain("Shown to players");
    expect(w.text()).toContain("Presenting");
  });

  it("explains what a notice board is when there are none", () => {
    mocks.boards = [];
    const w = mountTab();
    expect(w.text()).toContain("No notice boards yet");
    expect(w.text()).toContain("pin quests as notes, wanted posters and sealed letters");
  });

  it("keeps its search in the UI store, and Clear resets it", async () => {
    const w = mountTab();
    const ui = useDungeonFeaturesUiStore();
    expect(findExact(w, "Clear")).toBeUndefined();
    ui.noticeBoardsSearch = "sugar";
    await w.vm.$nextTick();
    expect(findExact(w, "Clear")).toBeDefined();
    await findExact(w, "Clear")!.trigger("click");
    expect(ui.noticeBoardsSearch).toBe("");
    expect(ui.noticeBoardsHasActiveFilters).toBe(false);
  });

  it("filters by name", async () => {
    mocks.boards = [board(), board({ id: "board-2", name: "Frontier Board" })];
    const w = mountTab();
    useDungeonFeaturesUiStore().noticeBoardsSearch = "frontier";
    await flushMicrotasks();
    expect(w.text()).toContain("Frontier Board");
    expect(w.text()).not.toContain("Pulled Sugar");
  });
});
