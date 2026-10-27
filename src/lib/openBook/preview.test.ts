// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { endPreview, previewFor, startPreview } from "./preview";

beforeEach(() => endPreview());

describe("open book preview marker", () => {
  it("answers only for the slug it was started for", () => {
    startPreview("salt", "c1");
    expect(previewFor("salt")).toBe("c1");
    expect(previewFor("other")).toBeNull();
    expect(previewFor(null)).toBeNull();
  });
  it("ends", () => {
    startPreview("salt", "c1");
    endPreview();
    expect(previewFor("salt")).toBeNull();
    expect(sessionStorage.getItem("grimoire:open-book-preview")).toBeNull();
  });
});

describe("a reload in the same tab", () => {
  const KEY = "grimoire:open-book-preview";
  const freshModule = async () => {
    vi.resetModules();
    return import("./preview");
  };

  it("keeps the preview the tab started", async () => {
    startPreview("salt", "c1");
    expect(JSON.parse(sessionStorage.getItem(KEY) ?? "null")).toEqual({ slug: "salt", campaignId: "c1" });
    const reloaded = await freshModule();
    expect(reloaded.previewFor("salt")).toBe("c1");
  });

  it("ignores a marker that is not a slug and a campaign", async () => {
    sessionStorage.setItem(KEY, JSON.stringify({ slug: "salt" }));
    expect((await freshModule()).previewFor("salt")).toBeNull();
    sessionStorage.setItem(KEY, "{broken");
    expect((await freshModule()).previewFor("salt")).toBeNull();
  });
});
