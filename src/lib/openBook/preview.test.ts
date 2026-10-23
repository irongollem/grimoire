// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
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
