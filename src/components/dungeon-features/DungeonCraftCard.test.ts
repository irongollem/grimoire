import { mount, RouterLinkStub } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import { useLowArt } from "@/composables/useLowArt";
import DungeonCraftCard from "./DungeonCraftCard.vue";

const props = {
  to: "/puzzles/p1", name: "Riddle Door", kind: "Puzzle", type: "Riddle", typeClass: "bg-primary",
  imageUrl: "https://x/p.webp", placeholder: "/p.webp", difficulty: "Hard", difficultyClass: "bg-destructive",
};
const mountCard = () => mount(DungeonCraftCard, { props, global: { stubs: { RouterLink: RouterLinkStub, AiImageBadge: true, SourceBadge: true } } });

describe("DungeonCraftCard", () => {
  afterEach(() => useLowArt().setLowArt(false));

  // Bug: the card keeps a plate in low art, or loses the difficulty when art is off.
  it("art on: the picture and the difficulty in the body", () => {
    const w = mountCard();
    expect(w.find("img").exists()).toBe(true);
    expect(w.text()).toContain("Hard");
  });

  it("low art: no picture, the kind as eyebrow, the type and difficulty in the foot", () => {
    useLowArt().setLowArt(true);
    const w = mountCard();
    expect(w.find("img").exists()).toBe(false);
    expect(w.text()).toContain("Puzzle");
    expect(w.text()).toContain("Riddle");
    expect(w.text()).toContain("Hard");
  });
});
