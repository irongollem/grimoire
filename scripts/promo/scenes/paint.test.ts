import { describe, expect, it } from "vitest";
import { hasAlpha, promptFor } from "./paint";

/** The first bytes of a PNG up to IHDR's colour type (byte 25), plus a chunk name further on. */
function png(colourType: number, chunks: string[] = []): Buffer {
  const head = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(head, 0);
  head.write("IHDR", 12, "ascii");
  head[25] = colourType;
  return Buffer.concat([head, Buffer.from(chunks.join(""), "ascii")]);
}

describe("hasAlpha", () => {
  // A part that came back on a white or checkered ground would be placed in the room as a rectangle.
  it("refuses a picture without an alpha channel", () => {
    expect(hasAlpha(png(2, ["IDAT"]))).toBe(false);
  });

  it("takes RGBA, and a palette only when it carries transparency before the image data", () => {
    expect(hasAlpha(png(6, ["IDAT"]))).toBe(true);
    expect(hasAlpha(png(3, ["tRNS", "IDAT"]))).toBe(true);
    expect(hasAlpha(png(3, ["IDAT", "tRNS"]))).toBe(false);
  });
});

describe("promptFor", () => {
  const base = { file: "x.png", subject: "A kettle.", size: "1024x1536" };

  // A brief in a lane the painter does not know would go out with no style at all.
  it("refuses a lane it has no words for", () => {
    expect(() => promptFor({ ...base, lane: "poster" })).toThrow(/no lane "poster"/);
  });

  it("asks a part with a room attached to match the room, and says the picture's shape", () => {
    const prompt = promptFor({ ...base, lane: "part", references: ["out/room.png"] });
    expect(prompt).toContain("match their painting style");
    expect(prompt).toContain("portrait 1024x1536");
  });
});
