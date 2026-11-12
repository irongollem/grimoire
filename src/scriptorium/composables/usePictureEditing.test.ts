// @vitest-environment happy-dom
import { effectScope, ref, shallowRef } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import type { PanelSelection } from "@/scriptorium/composables/useScriptoriumSelection";
import type { PictureActions } from "@/scriptorium/composables/useEditorPictures";
import type { IlluminateSettings } from "@/scriptorium/illuminator/lib/treatment";

const toastError = vi.fn();
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: toastError }) }));
vi.mock("@/lib/supabase", () => ({ getCurrentUser: () => ({ id: "u1" }) }));
// A URL is ours when the storage registry can read a bucket and a path out of it, in either URL shape.
vi.mock("@/lib/storage", async () => {
  const urls = await vi.importActual<typeof import("@/lib/storage/urls")>("@/lib/storage/urls");
  return { parsePublicUrl: urls.parsePublicUrl };
});
vi.mock("@/scriptorium/composables/usePictureBakes", () => ({ usePictureBakes: () => ({ schedule: vi.fn() }) }));
vi.mock("@/scriptorium/composables/usePicturePreviews", () => ({ usePicturePreviews: () => ({ schedule: vi.fn() }) }));

import { originalOf, usePictureEditing } from "./usePictureEditing";

const recipe: IlluminateSettings = { v: 1, seed: 1, steps: [{ type: "vignette", options: { strength: 0.3, softness: 0.5, mode: "transparent", colour: "#000000" } }] };

function setup(
  values: Record<string, unknown> | null,
  selection: PanelSelection = { kind: "picture", source: "node", pos: 5 },
  at: (id: string) => number | null = () => 5,
) {
  const treat = vi.fn();
  const pictures = {
    valuesOf: () => values,
    nodePosByBlockId: at,
    treat,
    pageOfPicture: () => 2,
  } as unknown as PictureActions;
  const scope = effectScope();
  const api = scope.run(() =>
    usePictureEditing({
      editor: shallowRef<Editor | undefined>(undefined),
      selection: ref(selection),
      version: ref(0),
      pictures,
      furniture: () => [],
      setFurniture: vi.fn(),
      firstPageLabel: () => "175",
      sheet: () => null,
      pageAspect: () => 0.75,
    }),
  );
  if (!api) throw new Error("no api");
  return { api, treat, scope };
}

describe("originalOf", () => {
  // Fails on: editing a treated picture from its bake, so edits stack on the baked pixels.
  it("is the untouched file of a treated picture, and the picture itself otherwise", () => {
    expect(originalOf({ src: "bake", original: "orig" })).toBe("orig");
    expect(originalOf({ src: "plain" })).toBe("plain");
    expect(originalOf({ src: "bake", original: "" })).toBe("bake");
    expect(originalOf(null)).toBeNull();
  });
});

describe("the workbench for the selected picture", () => {
  // Fails on: Edit picture staying limited to asset-images, so a place's or a monster's art could not be edited,
  // or opening for an outside picture, whose bytes taint the canvas.
  it("can edit any picture served from our storage, in either URL shape, and no outside one", () => {
    expect(setup({ src: "https://x.supabase.co/storage/v1/object/public/asset-images/u/a.webp" }).api.canEditPicture.value).toBe(true);
    expect(setup({ src: "https://x.supabase.co/storage/v1/object/public/monster-images/a.webp" }).api.canEditPicture.value).toBe(true);
    expect(setup({ src: "https://cdn.example.com/location-images/u/a.webp" }).api.canEditPicture.value).toBe(true);
    expect(setup({ src: "https://elsewhere.example/a.png" }).api.canEditPicture.value).toBe(false);
  });

  // Fails on: a treated picture opening on its bake, or its Done label naming the chapter page instead of the book page.
  it("opens on the original and its recipe, and goes back to the page in the book", () => {
    const { api } = setup({ src: "https://x.supabase.co/storage/v1/object/public/asset-images/u/bake.webp", original: "https://x.supabase.co/storage/v1/object/public/asset-images/u/orig.webp", illuminate: recipe, alt: "Rosie" });
    api.openWorkbench();
    expect(api.workbench.value).toMatchObject({ original: "https://x.supabase.co/storage/v1/object/public/asset-images/u/orig.webp", settings: recipe, name: "Rosie", pageLabel: "page 176" });
  });

  it("does not open for a picture it cannot edit", () => {
    const { api } = setup({ src: "https://elsewhere.example/a.png" });
    api.openWorkbench();
    expect(api.workbench.value).toBeNull();
  });

  // Fails on: the Crop button opening the workbench on another tool, or art on the page not offering the page's shape.
  it("opens on the tool asked for, and knows the page's shape only for art on the page", () => {
    const own = "https://x.supabase.co/storage/v1/object/public/asset-images/u/a.webp";
    const inText = setup({ src: own });
    inText.api.openWorkbench("crop");
    expect(inText.api.workbench.value).toMatchObject({ tool: "crop", pageAspect: null });
    const onPage = setup({ src: own }, { kind: "picture", source: "furniture", id: "f1" } as PanelSelection);
    onPage.api.openWorkbench();
    expect(onPage.api.workbench.value).toMatchObject({ tool: "edges", pageAspect: 0.75 });
  });

  // Fails on: Done writing the recipe without the original, so Reset has nothing to go back to.
  it("writes the recipe over the original on Done and closes", () => {
    const { api, treat } = setup({ src: "https://x.supabase.co/storage/v1/object/public/asset-images/u/a.webp" });
    api.openWorkbench();
    api.onWorkbenchDone(recipe);
    expect(treat).toHaveBeenCalledWith({ source: "node", pos: 5 }, { original: "https://x.supabase.co/storage/v1/object/public/asset-images/u/a.webp", illuminate: recipe, bakedFor: null });
    expect(api.workbench.value).toBeNull();
  });

  // Fails on: Done after the picture was deleted behind the workbench throwing or writing into nothing.
  it("writes nothing when the picture is gone", () => {
    const { api, treat } = setup({ src: "https://x.supabase.co/storage/v1/object/public/asset-images/u/a.webp" });
    api.openWorkbench();
    const gone = setup(null);
    gone.api.workbench.value = api.workbench.value;
    gone.api.onWorkbenchDone(recipe);
    expect(gone.treat).not.toHaveBeenCalled();
    expect(treat).not.toHaveBeenCalled();
  });
  const OWN = "https://x.supabase.co/storage/v1/object/public/asset-images/u/";

  // Fails on: Done writing to whatever sits at the remembered position, so a picture that moved (text typed above,
  // another device's save) lost its place and a different picture got this recipe.
  it("writes to the picture it opened on after it moved, and not to another one at the old position", () => {
    const moved = setup({ src: `${OWN}a.webp`, blockId: "b1" }, undefined, () => 9);
    moved.api.openWorkbench();
    moved.api.onWorkbenchDone(recipe);
    expect(moved.treat).toHaveBeenCalledWith({ source: "node", pos: 9 }, expect.anything());

    // Another picture now sits at the old position: the one that was opened is gone.
    toastError.mockClear();
    const gone = setup({ src: `${OWN}other.webp`, blockId: "b2" }, undefined, () => null);
    gone.api.openWorkbench();
    gone.api.onWorkbenchDone(recipe);
    expect(gone.treat).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining("changed while you were editing"));
  });

  // Fails on: the id surviving but its picture having been replaced by another file, which would still take the recipe.
  it("does not write when the picture under that id is a different file now", () => {
    const { api, treat } = setup({ src: `${OWN}a.webp`, blockId: "b1" });
    api.openWorkbench();
    // The same block id, another file: swap what valuesOf answers by reopening against changed values.
    const open = api.workbench.value;
    const changed = setup({ src: `${OWN}replaced.webp`, blockId: "b1" });
    changed.api.workbench.value = open;
    changed.api.onWorkbenchDone(recipe);
    expect(changed.treat).not.toHaveBeenCalled();
    expect(treat).not.toHaveBeenCalled();
  });
});
