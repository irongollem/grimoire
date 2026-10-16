import { mount } from "@vue/test-utils";
import { computed, nextTick, reactive } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NoticeBoardPresenter from "./NoticeBoardPresenter.vue";
import { board } from "./fixtures";
import type { PlayerNoticeBoard } from "@/types/noticeBoard.types";

const state = reactive<{ board: PlayerNoticeBoard | null; route: { name: string; params: Record<string, string> } }>({
  board: null,
  route: { name: "play-hearth", params: {} },
});

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  useRoute: () => state.route,
}));
vi.mock("@/composables/noticeBoards/usePlayerNoticeBoards", () => ({
  usePresentedNoticeBoard: () => computed(() => state.board),
}));

const stubs = {
  AppModal: { props: ["open", "label"], emits: ["close"], template: `<div v-if="open" data-modal><slot /></div>` },
  ModalHeader: { props: ["title"], emits: ["close"], template: `<header>{{ title }}<button data-close @click="$emit('close')" /></header>` },
  PlayerNoticeBoard: { template: "<div data-board />" },
};
const mountIt = () => mount(NoticeBoardPresenter, { global: { stubs } });
const NAME = "The Notice Board at The Pulled Sugar Inn";

describe("NoticeBoardPresenter", () => {
  beforeEach(() => {
    state.board = null;
    state.route = { name: "play-hearth", params: {} };
  });

  it("stays closed while nothing is presented", () => {
    expect(mountIt().find("[data-modal]").exists()).toBe(false);
  });

  it("opens with the board's name when the DM presents it", async () => {
    const w = mountIt();
    state.board = board({ presented_at: "2026-10-15T20:00:00Z" });
    await nextTick();
    expect(w.find("[data-modal]").exists()).toBe(true);
    expect(w.text()).toContain(NAME);
  });

  it("closing dismisses that presentation only: a new presented_at opens it again", async () => {
    state.board = board({ presented_at: "2026-10-15T20:00:00Z" });
    const w = mountIt();
    await w.get("[data-close]").trigger("click");
    expect(w.find("[data-modal]").exists()).toBe(false);
    state.board = board({ presented_at: "2026-10-15T20:00:00Z", updated_at: "2026-10-15T20:05:00Z" });
    await nextTick();
    expect(w.find("[data-modal]").exists()).toBe(false);
    state.board = board({ presented_at: "2026-10-16T19:00:00Z" });
    await nextTick();
    expect(w.find("[data-modal]").exists()).toBe(true);
  });

  it("closes when the DM stops presenting", async () => {
    state.board = board({ presented_at: "2026-10-15T20:00:00Z" });
    const w = mountIt();
    expect(w.find("[data-modal]").exists()).toBe(true);
    state.board = null;
    await nextTick();
    expect(w.find("[data-modal]").exists()).toBe(false);
  });

  it("does not cover the page of the very board it presents", () => {
    state.board = board({ presented_at: "2026-10-15T20:00:00Z" });
    state.route = { name: "play-notice-board", params: { id: "board-1" } };
    expect(mountIt().find("[data-modal]").exists()).toBe(false);
  });
});
