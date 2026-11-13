import { afterEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import PuzzleIdentityCard from "./PuzzleIdentityCard.vue";
import FocalImage from "@/components/common/media/FocalImage.vue";
import PortraitOnRequest from "@/components/common/media/PortraitOnRequest.vue";
import { useLowArt } from "@/composables/useLowArt";

vi.mock("@/lib/placeholderFocalPoints", () => ({
  placeholderUrl: () => "/p.webp",
  initPlaceholderFocalPoints: vi.fn().mockResolvedValue(undefined),
  getPlaceholderFocalPoint: vi.fn(),
}));

const puzzle = {
  name: "The Drowned Riddle",
  image_url: "https://x/riddle.webp",
  image_focal_point: null,
  puzzle_type: "Riddle",
  difficulty: "Hard",
  tags: [],
  skill_checks: [],
} as never;

const mountCard = (p = puzzle) => mount(PuzzleIdentityCard, { props: { puzzle: p }, global: { stubs: { AiImageBadge: true } } });

afterEach(() => {
  useLowArt().setLowArt(false);
});

describe("PuzzleIdentityCard low art", () => {
  // Bug: the puzzle sheet still fetches its picture column in low art.
  it("drops the picture column and keeps the picture behind a Portrait button", () => {
    useLowArt().setLowArt(true);
    const w = mountCard();
    expect(w.findComponent(FocalImage).exists()).toBe(false);
    expect(w.find("img").exists()).toBe(false);
    expect(w.text()).toContain("The Drowned Riddle");
    expect(w.findComponent(PortraitOnRequest).exists()).toBe(true);
  });

  // Bug: a puzzle with no picture of its own offers a Portrait button that opens nothing.
  it("offers no Portrait button when the puzzle has no picture", () => {
    useLowArt().setLowArt(true);
    const w = mountCard({ ...(puzzle as object), image_url: null } as never);
    expect(w.text()).not.toContain("Portrait");
  });

  it("draws the picture column unchanged with low art off", () => {
    const w = mountCard();
    expect(w.findComponent(FocalImage).props("record")).toBe(true);
    expect(w.findComponent(PortraitOnRequest).exists()).toBe(false);
  });
});
