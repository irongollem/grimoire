import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useVirtualGridViewport } from "@/components/common/list/virtualGridTestViewport";
import DungeonCraftNoticeBoardsTab from "./DungeonCraftNoticeBoardsTab.vue";
import { useLowArt } from "@/composables/useLowArt";
import { useListLayout } from "@/composables/useListLayout";

useVirtualGridViewport({ viewportPx: 1000000, itemPx: 200 });

const boards = [
  { id: "b1", name: "The Gilded Wall", surface: "cork", scatter: 1, is_revealed: true, presented_at: null },
];
const pins = [
  { id: "p1", board_id: "b1", status: "up" },
  { id: "p2", board_id: "b1", status: "up" },
];

vi.mock("@/composables/noticeBoards/useNoticeBoards", () => ({
  useNoticeBoards: () => ({ data: ref(boards), isLoading: ref(false) }),
  useCampaignNoticeBoardPins: () => ({ data: ref(pins) }),
}));
vi.mock("@/lib/noticeBoard/faces", () => ({ toPinFace: (p: { id: string }) => ({ id: p.id }) }));
vi.mock("@/composables/campaign/useMoveToCampaignFlow", () => ({ useMoveToCampaignFlow: () => ({ moving: ref(false), move: vi.fn() }) }));
vi.mock("@/composables/campaign/useCopyToCampaignFlow", () => ({
  useCopyToCampaignFlow: () => ({ copyOpen: ref(false), copyIds: ref([]), onCopied: vi.fn(), onQuotaExceeded: vi.fn(), openCopy: vi.fn() }),
}));
vi.mock("@/composables/useBreakpoint", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/composables/useBreakpoint")>()), useAbove: () => ref(true) }));

const stubs = {
  RouterLink: RouterLinkStub,
  NoticeBoardSurface: { template: "<div data-surface><slot /></div>" },
  NoticeBoardPin: { template: "<div data-pin />" },
};

async function mountTab() {
  const w = mount(DungeonCraftNoticeBoardsTab, { global: { stubs } });
  await flushPromises();
  return w;
}

describe("DungeonCraftNoticeBoardsTab low art", () => {
  beforeEach(() => setActivePinia(createPinia()));
  afterEach(() => {
    useLowArt().setLowArt(false);
    useListLayout("notice-boards", "grid").value = "grid";
  });

  // Bug: low art still renders the live board preview, whose pins can carry pictures.
  it("drops the live board preview for the art-free card with the pin count and state", async () => {
    useLowArt().setLowArt(true);
    useListLayout("notice-boards", "grid").value = "grid";
    const w = await mountTab();
    expect(w.find("[data-board-preview]").exists()).toBe(false);
    expect(w.find("[data-pin]").exists()).toBe(false);
    expect(w.text()).toContain("Notice board");
    expect(w.text()).toContain("The Gilded Wall");
    expect(w.text()).toContain("2 notices up");
  });

  it("keeps the board preview with low art off", async () => {
    expect((await mountTab()).find("[data-board-preview]").exists()).toBe(true);
  });
});
