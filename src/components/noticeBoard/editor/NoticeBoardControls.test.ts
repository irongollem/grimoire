// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NoticeBoardControls from "./NoticeBoardControls.vue";
import { scatterCount } from "@/lib/noticeBoard/scatter";
import type { NoticeBoard, NoticePinFace } from "@/types/noticeBoard.types";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  reveal: vi.fn(),
  present: vi.fn(),
}));

vi.mock("@/composables/noticeBoards/useNoticeBoards", () => ({
  useUpdateNoticeBoard: () => ({ mutate: mocks.update, mutateAsync: mocks.update, isPending: ref(false) }),
  useSetNoticeBoardRevealed: () => ({ mutate: mocks.reveal, isPending: ref(false) }),
  usePresentNoticeBoard: () => ({ mutate: mocks.present, isPending: ref(false) }),
}));

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

const find = (w: ReturnType<typeof mount>, text: string) => w.findAll("button").find((b) => b.text() === text);

describe("NoticeBoardControls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers Present now only once the board is shown to players", () => {
    expect(find(mount(NoticeBoardControls, { props: { board: board(), pins: [] } }), "Present now")).toBeUndefined();
    expect(find(mount(NoticeBoardControls, { props: { board: board({ is_revealed: true }), pins: [] } }), "Present now")).toBeDefined();
  });

  it("says in its tooltip that presenting opens the board on every player's screen", () => {
    const w = mount(NoticeBoardControls, { props: { board: board({ is_revealed: true }), pins: [] } });
    expect(find(w, "Present now")?.attributes("title")).toContain("every player's screen");
  });

  it("presents and stops presenting", async () => {
    const w = mount(NoticeBoardControls, { props: { board: board({ is_revealed: true }), pins: [] } });
    await find(w, "Present now")?.trigger("click");
    expect(mocks.present).toHaveBeenCalledWith({ boardId: "board-1", present: true });

    const live = mount(NoticeBoardControls, { props: { board: board({ is_revealed: true, presented_at: "2026-10-16T20:00:00Z" }), pins: [] } });
    expect(live.text()).toContain("On every player's screen now");
    await find(live, "Stop presenting")?.trigger("click");
    expect(mocks.present).toHaveBeenCalledWith({ boardId: "board-1", present: false });
  });

  it("reveals the board from the toggle", async () => {
    const w = mount(NoticeBoardControls, { props: { board: board(), pins: [] } });
    await find(w, "Shown to players")?.trigger("click");
    expect(mocks.reveal).toHaveBeenCalledWith({ boardId: "board-1", revealed: true });
  });

  it("switches surface without waiting for a debounce", async () => {
    const w = mount(NoticeBoardControls, { props: { board: board(), pins: [] } });
    await find(w, "Planks, pine frame")?.trigger("click");
    expect(mocks.update).toHaveBeenCalledWith({ id: "board-1", update: { surface: "planks" } });
  });

  it("shows the board's name in its field", () => {
    const w = mount(NoticeBoardControls, { props: { board: board(), pins: [] } });
    expect((w.get("input").element as HTMLInputElement).value).toBe("The Notice Board at The Pulled Sugar Inn");
  });

  it("adds scatter clear of the pins at once, and offers to re-roll and clear it after", async () => {
    const pins = [{ id: "p1", style: "poster", size: "lg", x: 0.4, y: 0.3 }] as NoticePinFace[];
    const w = mount(NoticeBoardControls, { props: { board: board(), pins } });
    expect(find(w, "Clear scatter")).toBeUndefined();
    await find(w, "Add scatter")?.trigger("click");
    const { scatter } = mocks.update.mock.calls[0][0].update;
    expect(scatter.length).toBeGreaterThan(0);
    expect(scatter.length).toBe(scatterCount(pins));

    const scattered = mount(NoticeBoardControls, { props: { board: board({ scatter }), pins } });
    expect(find(scattered, "Scatter again")).toBeDefined();
    await find(scattered, "Clear scatter")?.trigger("click");
    expect(mocks.update).toHaveBeenLastCalledWith({ id: "board-1", update: { scatter: [] } });
  });

  it("hides a shown board again", async () => {
    const shown = mount(NoticeBoardControls, { props: { board: board({ is_revealed: true }), pins: [] } });
    await find(shown, "Hidden from players")?.trigger("click");
    expect(mocks.reveal).toHaveBeenCalledWith({ boardId: "board-1", revealed: false });
  });

  it("shows a rename made elsewhere, but not over words typed here", async () => {
    const w = mount(NoticeBoardControls, { props: { board: board(), pins: [] } });
    const field = () => (w.get("input").element as HTMLInputElement).value;
    await w.setProps({ board: board({ name: "Renamed by another tab" }) });
    expect(field()).toBe("Renamed by another tab");
    await w.get("input").setValue("typing here");
    await w.setProps({ board: board({ name: "Another rename" }) });
    expect(field()).toBe("typing here");
  });

  it("does not save a board renamed to nothing, so the list never shows a blank card", async () => {
    const w = mount(NoticeBoardControls, { props: { board: board(), pins: [] } });
    await w.get("input").setValue("   ");
    await (w.vm as unknown as { saveNow: () => Promise<void> }).saveNow();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("saves a rename trimmed", async () => {
    const w = mount(NoticeBoardControls, { props: { board: board(), pins: [] } });
    await w.get("input").setValue("  The Gilded Stag  ");
    await (w.vm as unknown as { saveNow: () => Promise<void> }).saveNow();
    expect(mocks.update).toHaveBeenCalledWith({ id: "board-1", update: { name: "The Gilded Stag" } });
  });
});
