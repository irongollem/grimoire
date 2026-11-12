import { describe, expect, it } from "vitest";
import { chapterPictureUrls } from "./chapterPictureUrls";

describe("chapterPictureUrls", () => {
  // Bug: only the in-text pictures were looked at, so art placed behind the text never got its AI-made label.
  it("finds images at any depth and the placed art, once each", () => {
    const content = {
      type: "doc",
      content: [
        { type: "image", attrs: { src: "a.webp" } },
        { type: "paragraph", content: [{ type: "text", text: "no picture" }] },
        { type: "blockquote", content: [{ type: "image", attrs: { src: "b.webp" } }, { type: "image", attrs: { src: "a.webp" } }] },
        { type: "image", attrs: { src: "" } },
      ],
    };
    expect(chapterPictureUrls(content, [{ src: "c.webp" }, { src: "b.webp" }])).toEqual(["a.webp", "b.webp", "c.webp"]);
  });
});
