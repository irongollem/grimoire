import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import NoticeBoardScatter from "./NoticeBoardScatter.vue";

describe("NoticeBoardScatter", () => {
  it("draws scraps with their tack and lone tacks, hidden from assistive tech and from taps", () => {
    const w = mount(NoticeBoardScatter, {
      props: {
        pieces: [
          { art: "scrap-1", x: 0.2, y: 0.3, r: 12, tack: "tack-red" },
          { art: "nail", x: 0.7, y: 0.6, r: 90, tack: null },
        ],
      },
    });
    expect(w.attributes("aria-hidden")).toBe("true");
    expect(w.findAll(".nb-scatter-piece.is-scrap")).toHaveLength(1);
    expect(w.findAll(".nb-scatter-piece.is-tack")).toHaveLength(1);
    expect(w.findAll(".nb-scatter-tack")).toHaveLength(1);
    expect(w.find(".is-scrap").attributes("style")).toContain("left: 20%");
  });

  it("skips a piece naming art this build does not have", () => {
    const w = mount(NoticeBoardScatter, { props: { pieces: [{ art: "twine-nail", x: 0.5, y: 0.5, r: 0, tack: null }] } });
    expect(w.findAll(".nb-scatter-piece")).toHaveLength(0);
  });
});
