import { describe, expect, it } from "vitest";
import { furniturePropsFromImage, imageAttrsFromFurniture } from "./pictureConversion";

describe("pictureConversion", () => {
  // Fails on: width left as a percentage (or a wrong page width) so the picture lands at a different size in the text.
  it("turns a width in percent of the page into pixels", () => {
    const attrs = imageAttrsFromFurniture({ width: 50, props: { src: "a.webp" } }, 794);
    expect(attrs).toMatchObject({ src: "a.webp", width: "397", layoutMode: "inline", dataAlign: "center" });
  });

  // Fails on: the picture's treatment staying behind when it goes into the text, in either direction.
  it("carries the treatment across unchanged, both ways", () => {
    const recipe = { steps: [{ type: "edges", style: "paper" }] };
    const toText = imageAttrsFromFurniture({ width: 40, props: { src: "b", original: "o", illuminate: recipe as never, bakedFor: "h" } }, 800);
    expect(toText).toMatchObject({ original: "o", illuminate: recipe, bakedFor: "h" });
    const toPage = furniturePropsFromImage({ src: "b", width: "320", original: "o", illuminate: recipe, bakedFor: "h" });
    expect(toPage).toEqual({ src: "b", original: "o", illuminate: recipe, bakedFor: "h" });
  });

  it("makes nothing from a picture with no file", () => {
    expect(imageAttrsFromFurniture({ width: 40, props: { src: "" } }, 800)).toBeNull();
    expect(furniturePropsFromImage({ src: null })).toBeNull();
  });
});
