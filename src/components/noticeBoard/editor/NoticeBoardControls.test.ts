// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NoticeBoardControls from "./NoticeBoardControls.vue";
import type { NoticeBoard } from "@/types/noticeBoard.types";

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
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

const find = (w: ReturnType<typeof mount>, text: string) => w.findAll("button").find((b) => b.text() === text);

describe("NoticeBoardControls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("offers Present now only once the board is shown to players", () => {
    expect(find(mount(NoticeBoardControls, { props: { board: board() } }), "Present now")).toBeUndefined();
    expect(find(mount(NoticeBoardControls, { props: { board: board({ is_revealed: true }) } }), "Present now")).toBeDefined();
  });

  it("says in its tooltip that presenting opens the board on every player's screen", () => {
    const w = mount(NoticeBoardControls, { props: { board: board({ is_revealed: true }) } });
    expect(find(w, "Present now")?.attributes("title")).toContain("every player's screen");
  });

  it("presents and stops presenting", async () => {
    const w = mount(NoticeBoardControls, { props: { board: board({ is_revealed: true }) } });
    await find(w, "Present now")?.trigger("click");
    expect(mocks.present).toHaveBeenCalledWith({ boardId: "board-1", present: true });

    const live = mount(NoticeBoardControls, { props: { board: board({ is_revealed: true, presented_at: "2026-10-16T20:00:00Z" }) } });
    expect(live.text()).toContain("On every player's screen now");
    await find(live, "Stop presenting")?.trigger("click");
    expect(mocks.present).toHaveBeenCalledWith({ boardId: "board-1", present: false });
  });

  it("reveals the board from the toggle", async () => {
    const w = mount(NoticeBoardControls, { props: { board: board() } });
    await find(w, "Shown to players")?.trigger("click");
    expect(mocks.reveal).toHaveBeenCalledWith({ boardId: "board-1", revealed: true });
  });

  it("switches surface without waiting for a debounce", async () => {
    const w = mount(NoticeBoardControls, { props: { board: board() } });
    await find(w, "Planks, pine frame")?.trigger("click");
    expect(mocks.update).toHaveBeenCalledWith({ id: "board-1", update: { surface: "planks" } });
  });

  it("shows the board's name in its field", () => {
    const w = mount(NoticeBoardControls, { props: { board: board() } });
    expect((w.get("input").element as HTMLInputElement).value).toBe("The Notice Board at The Pulled Sugar Inn");
  });
});
