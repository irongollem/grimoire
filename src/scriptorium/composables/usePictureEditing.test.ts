// @vitest-environment happy-dom
import { effectScope, ref, shallowRef } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/core";
import type { PanelSelection } from "@/scriptorium/composables/useScriptoriumSelection";
import type { PictureActions } from "@/scriptorium/composables/useEditorPictures";
import type { IlluminateSettings } from "@/scriptorium/illuminator/lib/treatment";

vi.mock("@/lib/supabase", () => ({ getCurrentUser: () => ({ id: "u1" }) }));
// The bucket check is the registry's; here a URL is ours when it says so.
vi.mock("@/lib/storage", () => ({ isBucketUrl: (_b: string, url: unknown) => typeof url === "string" && url.includes("/asset-images/") }));
vi.mock("@/scriptorium/composables/usePictureBakes", () => ({ usePictureBakes: () => ({ schedule: vi.fn() }) }));
vi.mock("@/scriptorium/composables/usePicturePreviews", () => ({ usePicturePreviews: () => ({ schedule: vi.fn() }) }));

import { originalOf, usePictureEditing } from "./usePictureEditing";

const recipe: IlluminateSettings = { v: 1, seed: 1, steps: [{ type: "vignette", options: { strength: 0.3, softness: 0.5, mode: "transparent", colour: "#000000" } }] };

function setup(values: Record<string, unknown> | null, selection: PanelSelection = { kind: "picture", source: "node", pos: 5 }) {
  const treat = vi.fn();
  const pictures = {
    valuesOf: () => values,
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
  // Fails on: Edit picture being offered for a picture from another bucket, whose bytes a canvas cannot read.
  it("can edit only pictures in our own bucket", () => {
    expect(setup({ src: "https://cdn/asset-images/u/a.webp" }).api.canEditPicture.value).toBe(true);
    expect(setup({ src: "https://cdn/monster-images/a.webp" }).api.canEditPicture.value).toBe(false);
  });

  // Fails on: a treated picture opening on its bake, or its Done label naming the chapter page instead of the book page.
  it("opens on the original and its recipe, and goes back to the page in the book", () => {
    const { api } = setup({ src: "https://cdn/asset-images/u/bake.webp", original: "https://cdn/asset-images/u/orig.webp", illuminate: recipe, alt: "Rosie" });
    api.openWorkbench();
    expect(api.workbench.value).toMatchObject({ original: "https://cdn/asset-images/u/orig.webp", settings: recipe, name: "Rosie", pageLabel: "page 176" });
  });

  it("does not open for a picture it cannot edit", () => {
    const { api } = setup({ src: "https://cdn/monster-images/a.webp" });
    api.openWorkbench();
    expect(api.workbench.value).toBeNull();
  });

  // Fails on: Done writing the recipe without the original, so Reset has nothing to go back to.
  it("writes the recipe over the original on Done and closes", () => {
    const { api, treat } = setup({ src: "https://cdn/asset-images/u/a.webp" });
    api.openWorkbench();
    api.onWorkbenchDone(recipe);
    expect(treat).toHaveBeenCalledWith({ source: "node", pos: 5 }, { original: "https://cdn/asset-images/u/a.webp", illuminate: recipe });
    expect(api.workbench.value).toBeNull();
  });

  // Fails on: Done after the picture was deleted behind the workbench throwing or writing into nothing.
  it("writes nothing when the picture is gone", () => {
    const { api, treat } = setup({ src: "https://cdn/asset-images/u/a.webp" });
    api.openWorkbench();
    const gone = setup(null);
    gone.api.workbench.value = api.workbench.value;
    gone.api.onWorkbenchDone(recipe);
    expect(gone.treat).not.toHaveBeenCalled();
    expect(treat).not.toHaveBeenCalled();
  });
});
