import { mount, RouterLinkStub } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PlayerJournalNoticeBoardsTab from "./PlayerJournalNoticeBoardsTab.vue";
import { board } from "@/components/player/noticeBoard/fixtures";

function mountTab(props: { isLoading?: boolean; boards: ReturnType<typeof board>[]; isNew?: (id: string) => boolean }) {
  return mount(PlayerJournalNoticeBoardsTab, {
    props: { isLoading: props.isLoading ?? false, boards: props.boards, isNew: props.isNew ?? (() => false) },
    global: {
      stubs: {
        RouterLink: RouterLinkStub,
        NoticeBoardSurface: { template: "<div><slot /></div>" },
        NoticeBoardPin: true,
        EntityNewDot: { props: ["isNew"], template: '<i v-if="isNew" data-testid="new-dot" />' },
      },
    },
  });
}

describe("PlayerJournalNoticeBoardsTab", () => {
  it("lists each board by name, linked to its page, flagging Presenting now and new", () => {
    const w = mountTab({
      boards: [board({ presented_at: "2026-10-15T20:00:00Z" }), board({ id: "board-2", name: "Chapel door" })],
      isNew: (id) => id === "board-2",
    });
    expect(w.text()).toContain("The Notice Board at The Pulled Sugar Inn");
    expect(w.text()).toContain("Chapel door");
    expect(w.findAll('[data-board-state="presenting"]')).toHaveLength(1);
    expect(w.findAll('[data-testid="new-dot"]')).toHaveLength(1);
    expect(w.findAllComponents(RouterLinkStub)[0].props("to")).toEqual({ name: "play-notice-board", params: { id: "board-1" } });
  });

  it("says what to expect when there are none", () => {
    expect(mountTab({ boards: [] }).text()).toContain("No notice boards yet. When your DM puts one up, it will appear here.");
  });
});
