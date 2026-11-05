import { describe, expect, it } from "vitest";
import { cardImageFilename, cardImageScale, cardImageWidthPx } from "./cardImage";

describe("card image size (#1141: 63×88 mm and 70×120 mm at 300 dpi)", () => {
  it.each([
    // 63 mm / 25.4 mm per inch × 300 dpi = 744.1 px
    ["mtg", 744],
    // 70 mm / 25.4 × 300 = 826.8 px
    ["tarot", 827],
  ] as const)("a %s card saves %i px wide", (size, px) => {
    expect(cardImageWidthPx(size)).toBe(px);
  });

  it("scales the preview card's CSS width up to the print width", () => {
    // A 200 px trading card drawn 3.72× comes out at 744 px.
    expect(200 * cardImageScale("mtg", 200)).toBeCloseTo(744);
  });
});

describe("card image file name", () => {
  it("says which face it is", () => {
    expect(cardImageFilename("Ashen Warden", "back")).toBe("Ashen_Warden_card_back.png");
  });

  it("turns a slash or colon into an underscore, not a folder", () => {
    expect(cardImageFilename("Bag of Tricks / Grey: Rust", "front")).toBe(
      "Bag_of_Tricks_Grey_Rust_card_front.png",
    );
  });

  it("falls back to 'card' when nothing printable is left", () => {
    expect(cardImageFilename(" / ", "front")).toBe("card_card_front.png");
  });
});
