import { describe, expect, it } from "vitest";
import { publicAssetUrl } from "./assets";

describe("publicAssetUrl", () => {
  it("fetches a sound the page played from local storage from the CDN, where the file exists", () => {
    expect(publicAssetUrl("http://127.0.0.1:54321/storage/v1/object/public/sounds/library/crafting/acid-bubble.ogg", "https://cdn.test")).toBe(
      "https://cdn.test/sounds/library/crafting/acid-bubble.ogg",
    );
  });

  it("leaves a URL that is already public alone, rather than doubling the CDN prefix", () => {
    const url = "https://cdn.test/sounds/library/crafting/acid-bubble.ogg";
    expect(publicAssetUrl(url, "https://cdn.test")).toBe(url);
  });
});
