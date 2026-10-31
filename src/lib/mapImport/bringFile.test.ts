import { describe, expect, it } from "vitest";
import { describeFile, isUniversalVttName, nameFromFile } from "./bringFile";

describe("nameFromFile", () => {
  it("drops the extension and the grid size the creator put in the name", () => {
    expect(nameFromFile("riverside_ambush_30x20.webm")).toBe("riverside ambush");
  });
  it("drops a bracketed size too", () => {
    expect(nameFromFile("Forest Glade [22x30].jpg")).toBe("Forest Glade");
  });
  it("keeps a number that is not a size", () => {
    expect(nameFromFile("level 2 crypt.png")).toBe("level 2 crypt");
  });
});

describe("isUniversalVttName", () => {
  it.each(["a.dd2vtt", "a.UVTT", "a.df2vtt"])("reads %s as Universal VTT", (n) => expect(isUniversalVttName(n)).toBe(true));
  it("does not read a picture as one", () => expect(isUniversalVttName("a.png")).toBe(false));
});

describe("describeFile", () => {
  it("names the file as the frame does: kind, size in pixels, weight", () => {
    expect(describeFile({ name: "x.webm", size: 48 * 1024 * 1024 }, "video", { width: 3840, height: 2560 })).toBe(
      "WebM video · 3840 × 2560 · 48 MB",
    );
  });
  it("calls an MP4 an MP4", () => {
    expect(describeFile({ name: "x.mp4", size: 5 * 1024 * 1024 }, "video", null)).toBe("MP4 video · 5 MB");
  });
});
