import { describe, expect, it } from "vitest";
import { CAPTION_MAX_CHARS, CAPTION_MAX_HASHTAGS, captionProblems, reelContainerParams } from "./instagram";

const OK = "Combat in Dungeon Grimoire.\n\nRoll your own initiative.\n\n#dnd #dnd5e #ttrpg";

describe("captionProblems", () => {
  it("passes a caption Instagram would take as written", () => {
    expect(captionProblems(OK)).toEqual([]);
  });

  it("refuses an empty caption, so a missing caption file's blank never posts", () => {
    expect(captionProblems("  \n")).toContain("the caption is empty");
  });

  it("refuses a caption over the character limit, counting characters rather than UTF-16 units", () => {
    expect(captionProblems("a".repeat(CAPTION_MAX_CHARS))).toEqual([]);
    expect(captionProblems("a".repeat(CAPTION_MAX_CHARS + 1))[0]).toMatch(/characters/);
    // An emoji is one character to Instagram and two UTF-16 units to JavaScript's .length.
    expect(captionProblems("🎲".repeat(CAPTION_MAX_CHARS))).toEqual([]);
  });

  it("refuses more hashtags than Instagram allows", () => {
    const tags = (n: number) => Array.from({ length: n }, (_, i) => `#t${i}`).join(" ");
    expect(captionProblems(`Hi\n\n${tags(CAPTION_MAX_HASHTAGS)}`)).toEqual([]);
    expect(captionProblems(`Hi\n\n${tags(CAPTION_MAX_HASHTAGS + 1)}`)[0]).toMatch(/hashtags/);
  });

  it("catches a tag-line word that lost its #, the slip on the first Workshop Reel", () => {
    expect(captionProblems("Hi\n\n#dnd #dungeonmaster dmtips dndcrafting")).toEqual([
      "the hashtag line has words without a #: dmtips dndcrafting",
    ]);
  });
});

describe("reelContainerParams", () => {
  it("sends a title cover as cover_url and no frame offset, so the grid shows the designed cover", () => {
    const p = reelContainerParams({ caption: OK, cover: { url: "https://cdn.example/promo/ep/abc-title-cover.jpg" } });
    expect(p.cover_url).toBe("https://cdn.example/promo/ep/abc-title-cover.jpg");
    expect(p).not.toHaveProperty("thumb_offset");
  });

  it("falls back to the frame at the cover time, in whole milliseconds", () => {
    const p = reelContainerParams({ caption: OK, cover: { atMs: 5500.4 } });
    expect(p.thumb_offset).toBe("5500");
    expect(p).not.toHaveProperty("cover_url");
  });
});
