import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MAX_SCREENSHOT_BYTES, validateScreenshot } from "./screenshot";

/**
 * A data URL whose base64 payload decodes to exactly `bytes` bytes.
 *
 * The padding is not decoration: unpadded base64 only ever encodes a multiple
 * of 3 bytes, and the 5MB cap is not one — so without the `=` chars the
 * "exactly at the cap" case below is unreachable and silently tests one byte
 * over instead.
 */
function dataUrl(mime: string, bytes: number): string {
  const pad = (3 - (bytes % 3)) % 3;
  const chars = Math.ceil(bytes / 3) * 4;
  return `data:${mime};base64,${"A".repeat(chars - pad)}${"=".repeat(pad)}`;
}

describe("validateScreenshot", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the data URL unchanged for every supported image type", () => {
    for (const mime of ["image/png", "image/jpeg", "image/webp", "image/gif"]) {
      const url = dataUrl(mime, 300);
      expect(validateScreenshot(url)).toBe(url);
    }
  });

  it("treats an absent screenshot as absent, not as an error", () => {
    expect(validateScreenshot(undefined)).toBeNull();
    expect(validateScreenshot(null)).toBeNull();
    expect(validateScreenshot("")).toBeNull();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("rejects a non-image data URL", () => {
    // The path that matters: `text/html` stored and later bound into an <img>
    // is inert, but nothing about this endpoint should accept it in the first
    // place, and `application/pdf` would render as a broken image forever.
    expect(validateScreenshot(dataUrl("text/html", 100))).toBeNull();
    expect(validateScreenshot(dataUrl("application/pdf", 100))).toBeNull();
    expect(validateScreenshot(dataUrl("image/svg+xml", 100))).toBeNull();
  });

  it("rejects anything that is not a base64 data URL", () => {
    expect(validateScreenshot("https://example.com/screenshot.png")).toBeNull();
    expect(validateScreenshot("data:image/png,notbase64")).toBeNull();
    expect(validateScreenshot("just a string")).toBeNull();
  });

  it("rejects a payload outside base64's alphabet", () => {
    // Guards the claim the regex is making: a match is proof the string
    // decodes, so anything that would throw in atob has to fail to match.
    expect(validateScreenshot("data:image/png;base64,AAAA$$$$")).toBeNull();
    expect(validateScreenshot("data:image/png;base64,AA A A")).toBeNull();
    expect(validateScreenshot("data:image/png;base64,")).toBeNull();
  });

  it("accepts a payload at the size cap and rejects one past it", () => {
    expect(validateScreenshot(dataUrl("image/jpeg", MAX_SCREENSHOT_BYTES))).not.toBeNull();
    expect(validateScreenshot(dataUrl("image/jpeg", MAX_SCREENSHOT_BYTES + 3))).toBeNull();
  });

  it("counts padding against the decoded size rather than the encoded length", () => {
    // "====" would be 3 bytes by the naive length/4*3, but two pad chars mean
    // one real byte. Getting this backwards would reject legitimate uploads
    // sitting just under the cap.
    expect(validateScreenshot("data:image/png;base64,QQ==")).toBe("data:image/png;base64,QQ==");
  });
});
