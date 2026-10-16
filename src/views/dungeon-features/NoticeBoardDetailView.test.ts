// @vitest-environment jsdom
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { grellRow, letterRow, pinRow } from "@/components/noticeBoard/editor/pinRows";
import type { NoticeBoard, NoticeBoardPin } from "@/types/noticeBoard.types";
import NoticeBoardViewport from "@/components/noticeBoard/NoticeBoardViewport.vue";
import NoticePinAdd from "@/components/noticeBoard/editor/NoticePinAdd.vue";
import NoticePinList from "@/components/noticeBoard/editor/NoticePinList.vue";
import NoticeBoardDetailView from "./NoticeBoardDetailView.vue";

const board: NoticeBoard = {
  id: "board-1",
  user_id: "u1",
  campaign_id: "camp-1",
  name: "The Notice Board at The Pulled Sugar Inn",
  surface: "cork",
  is_revealed: true,
  presented_at: null,
  scatter: [],
  created_at: "",
  updated_at: "",
};

const mocks = vi.hoisted(() => ({
  pins: [] as NoticeBoardPin[],
  board: null as NoticeBoard | null,
  push: vi.fn(),
  confirm: vi.fn(),
  updatePin: vi.fn(),
  createPin: vi.fn(),
  backUp: vi.fn(),
  removeBoard: vi.fn(),
  saveNow: vi.fn(),
  hold: vi.fn(),
  release: vi.fn(),
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { id: "board-1" } }),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({ data: ref([{ id: "m1", name: "Aria" }]) }),
}));
vi.mock("@/composables/noticeBoards/useNoticeBoards", () => ({
  useNoticeBoard: () => ({ data: ref(mocks.board), isLoading: ref(false) }),
  useNoticeBoardPins: () => ({ data: ref(mocks.pins) }),
  useUpdateNoticeBoardPin: () => ({ mutate: mocks.updatePin }),
  useCreateNoticeBoardPin: () => ({ mutateAsync: mocks.createPin }),
  usePinNoticeBackUp: () => ({ mutate: mocks.backUp }),
  useDeleteNoticeBoard: () => ({ mutateAsync: mocks.removeBoard }),
}));

const stubs = {
  PageHeader: { template: "<div><slot name='actions' /><slot /></div>" },
  NoticeBoardControls: {
    template: "<div data-controls />",
    setup: (_: unknown, { expose }: { expose: (e: object) => void }) =>
      expose({ saveNow: mocks.saveNow, hold: mocks.hold, release: mocks.release }),
  },
  NoticePinEditor: { props: ["pin"], template: "<div data-editor :data-pin='pin.id' />" },
  EntityPlacements: { props: ["kind", "entityId"], template: "<div data-placements :data-kind='kind' />" },
};

const mountView = () => mount(NoticeBoardDetailView, { global: { stubs } });
const find = (w: ReturnType<typeof mountView>, text: string) => w.findAll("button").find((b) => b.text() === text);

describe("NoticeBoardDetailView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.board = board;
    mocks.pins = [pinRow(), grellRow(), letterRow({ status: "draft" })];
    mocks.confirm.mockResolvedValue(true);
    mocks.createPin.mockResolvedValue({ id: "pin-new" });
  });

  it("hangs only the pins that are up or taken on the board, never a draft", () => {
    const w = mountView();
    const faces = w.getComponent(NoticeBoardViewport).props("pins");
    expect(faces.map((f: { id: string }) => f.id)).toEqual(["pin-goat", "pin-grell"]);
    expect(w.getComponent(NoticeBoardViewport).props("editable")).toBe(true);
  });

  it("names who took a pin on its stub", () => {
    mocks.pins = [pinRow({ status: "taken", taken_by: "m1", taken_at: "x", taken_session_number: 12 })];
    const faces = mountView().getComponent(NoticeBoardViewport).props("pins");
    expect(faces[0]).toMatchObject({ status: "taken", taken_by_name: "Aria", taken_session_number: 12 });
  });

  it("writes a dragged pin's new place", () => {
    const w = mountView();
    w.getComponent(NoticeBoardViewport).vm.$emit("move", "pin-goat", 0.5, 0.25);
    expect(mocks.updatePin).toHaveBeenCalledWith({ id: "pin-goat", update: { x: 0.5, y: 0.25 } });
  });

  it("adds a notice as a draft in free space and opens it for editing", async () => {
    const w = mountView();
    w.getComponent(NoticePinAdd).vm.$emit("add", "poster");
    await flushPromises();
    expect(mocks.createPin).toHaveBeenCalledWith(
      expect.objectContaining({
        campaign_id: "camp-1",
        board_id: "board-1",
        style: "poster",
        status: "draft",
        sort_order: 4,
        x: expect.any(Number),
        y: expect.any(Number),
      }),
    );
    // The new row is created, not yet on the board: the pin list is what the server returns next.
    expect(w.getComponent(NoticeBoardViewport).props("pins")).toHaveLength(2);
  });

  it("opens the editor for a pin picked from the list, and trades two numbers on a reorder", async () => {
    const w = mountView();
    w.getComponent(NoticePinList).vm.$emit("select", "pin-grell");
    await flushPromises();
    expect(w.get("[data-editor]").attributes("data-pin")).toBe("pin-grell");

    w.getComponent(NoticePinList).vm.$emit("move", "pin-goat", 1);
    // The goat (1) and the poster (2) trade numbers: two writes, nothing else on the board moves.
    expect(mocks.updatePin).toHaveBeenCalledWith({ id: "pin-goat", update: { sort_order: 2 } });
    expect(mocks.updatePin).toHaveBeenCalledWith({ id: "pin-grell", update: { sort_order: 1 } });
    expect(mocks.updatePin).toHaveBeenCalledTimes(2);
  });

  it("pins a taken notice back up from the list", () => {
    const w = mountView();
    w.getComponent(NoticePinList).vm.$emit("pin-back-up", "pin-goat");
    expect(mocks.backUp).toHaveBeenCalledWith("pin-goat");
  });

  it("lets the board hang at a place", () => {
    expect(mountView().get("[data-placements]").attributes("data-kind")).toBe("notice_board");
  });

  it("Done waits for the last save, then returns to the list", async () => {
    const w = mountView();
    await find(w, "Done")?.trigger("click");
    await flushPromises();
    expect(mocks.saveNow).toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/dungeon-craft?tab=notice-boards");
  });

  it("deletes only after confirming, stopping the name's autosave first", async () => {
    const w = mountView();
    mocks.confirm.mockResolvedValueOnce(false);
    await find(w, "Delete")?.trigger("click");
    await flushPromises();
    expect(mocks.removeBoard).not.toHaveBeenCalled();

    await find(w, "Delete")?.trigger("click");
    await flushPromises();
    expect(mocks.hold).toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalledWith("/dungeon-craft?tab=notice-boards");
    expect(mocks.removeBoard).toHaveBeenCalledWith("board-1");
  });

  it("says so when the board is gone", () => {
    mocks.board = null;
    expect(mountView().text()).toContain("no longer exists");
  });
});
