// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { usePicturePreviews } from "./usePicturePreviews";
import { hashSettings, type IlluminateSettings } from "@/scriptorium/illuminator/lib/treatment";
import { createFurnitureItem } from "@/scriptorium/lib/furniture/model";

const recipe: IlluminateSettings = { v: 1, seed: 1, steps: [{ type: "mask", url: "https://cdn/m.png" }] };
const hash = hashSettings(recipe);

function sheetWith(bakedFor: string | null): HTMLElement {
  const sheet = document.createElement("div");
  const img = document.createElement("img");
  img.setAttribute("src", "https://cdn/old-bake.webp");
  img.setAttribute("data-original", "https://cdn/orig.webp");
  img.setAttribute("data-illuminate", JSON.stringify(recipe));
  if (bakedFor) img.setAttribute("data-baked-for", bakedFor);
  sheet.append(img);
  return sheet;
}

function art() {
  const item = createFurnitureItem("art", { type: "page", chapterId: "c1", page: 1 });
  return { ...item, props: { ...item.props, src: "https://cdn/old-bake.webp", original: "https://cdn/orig.webp", illuminate: JSON.stringify(recipe) } };
}

function setup(sheet: HTMLElement) {
  const render = vi.fn(async () => new Blob(["x"]));
  const revokeUrl = vi.fn();
  const api = usePicturePreviews({
    editor: () => undefined,
    furniture: () => [art()],
    sheet: () => sheet,
    render,
    createUrl: () => "blob:preview",
    revokeUrl,
  });
  return { api, render, revokeUrl };
}

describe("usePicturePreviews", () => {
  // Fails on: an edit only showing after the bake lands, seconds later, which reads as the panel doing nothing.
  it("puts a preview on a picture whose bake is stale", async () => {
    const sheet = sheetWith(null);
    const { api } = setup(sheet);
    await api.refresh();
    expect(sheet.querySelector("img")?.getAttribute("src")).toBe("blob:preview");
  });

  // Fails on: a preview laid over a finished bake, so the blob (which is never saved) shadows the real picture.
  it("leaves a picture alone once its bake is current", async () => {
    const sheet = sheetWith(hash);
    const { api } = setup(sheet);
    await api.refresh();
    expect(sheet.querySelector("img")?.getAttribute("src")).toBe("https://cdn/old-bake.webp");
  });

  // Fails on: every refresh redrawing the same recipe, which costs a render per transaction while the author types.
  it("draws a recipe once however often it looks again", async () => {
    const { api, render } = setup(sheetWith(null));
    await api.refresh();
    await api.refresh();
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("applies a preview to a picture the page redrew, without drawing it again", async () => {
    const sheet = sheetWith(null);
    const { api, render } = setup(sheet);
    await api.refresh();
    sheet.querySelector("img")?.setAttribute("src", "https://cdn/old-bake.webp");
    api.apply();
    expect(sheet.querySelector("img")?.getAttribute("src")).toBe("blob:preview");
    expect(render).toHaveBeenCalledTimes(1);
  });
});
