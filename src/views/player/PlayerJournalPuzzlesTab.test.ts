import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import PlayerJournalPuzzlesTab from "./PlayerJournalPuzzlesTab.vue";
import { useLowArt } from "@/composables/useLowArt";
import type { PuzzleRoom } from "@/types/puzzle.types";

vi.mock("@/composables/player/useReadItems", () => ({ useReadItems: () => ({ isNew: () => false }) }));

const puzzle = {
  id: "p1",
  name: "The Singing Door",
  puzzle_type: "riddle",
  difficulty: "hard",
  image_url: "https://cdn.test/door.webp",
  image_focal_point: null,
  shared_hints: [],
  updated_at: "2026-11-01T00:00:00Z",
} as unknown as PuzzleRoom;

const { setLowArt } = useLowArt();
afterEach(() => {
  setLowArt(false);
});

function mountTab() {
  return mount(PlayerJournalPuzzlesTab, {
    props: { isLoading: false, puzzles: [puzzle] },
    global: {
      plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]],
      stubs: { RouterLink: { template: "<a><slot /></a>" } },
    },
  });
}

describe("PlayerJournalPuzzlesTab low art (#1179)", () => {
  it("draws the puzzle picture when low art is off (the control for the guard below)", () => {
    expect(mountTab().find("img").exists()).toBe(true);
  });

  it("a puzzle card still downloads its picture in low art, and keeps its type and difficulty chips", () => {
    setLowArt(true);
    const wrapper = mountTab();
    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.text()).toContain("The Singing Door");
    expect(wrapper.text()).toContain("riddle");
    expect(wrapper.text()).toContain("hard");
  });
});
