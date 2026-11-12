import { describe, expect, it } from "vitest";
import { webPictureAddress } from "./pictureAddress";

describe("webPictureAddress", () => {
  // Fails on: a javascript: or data: address becoming a picture source in a shared book.
  it.each([["javascript:alert(1)"], ["data:image/png;base64,AAAA"], ["not a url"], ["   "], ["ftp://x/y.png"]])("refuses %s", (text) => {
    expect(webPictureAddress(text)).toBeNull();
  });
  it("accepts http and https, trimmed", () => {
    expect(webPictureAddress("  https://example.com/a.png ")).toBe("https://example.com/a.png");
    expect(webPictureAddress("http://example.com/a.png")).toBe("http://example.com/a.png");
  });
});
