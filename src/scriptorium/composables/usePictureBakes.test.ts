// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
import { createFurnitureItem } from "@/scriptorium/lib/furniture/model";
import { hashSettings, type IlluminateSettings } from "@/scriptorium/illuminator/lib/treatment";
import type { PageFurnitureItem } from "@/scriptorium/types";

vi.mock("@/scriptorium/composables/illuminatorSweep", () => ({ markForSweep: vi.fn() }));

import { markForSweep } from "@/scriptorium/composables/illuminatorSweep";
import { staleFurnitureArt, staleImageNodes, usePictureBakes, type BakeFn } from "./usePictureBakes";

const recipe: IlluminateSettings = { v: 1, seed: 1, steps: [{ type: "mask", url: "https://cdn/m.png" }] };
const hash = hashSettings(recipe);

const editors: Editor[] = [];
function editorWith(...images: Record<string, unknown>[]): Editor {
  const ed = new Editor({
    extensions: createScriptoriumExtensions(),
    content: { type: "doc", content: images.map((attrs) => ({ type: "image", attrs: { src: "https://cdn/orig.webp", ...attrs } })) },
  });
  editors.push(ed);
  return ed;
}
afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

const imageAttrs = (ed: Editor, i = 0) => ed.getJSON().content?.[i].attrs;

function art(props: Record<string, string>): PageFurnitureItem {
  const item = createFurnitureItem("art", { type: "page", chapterId: "c1", page: 1 });
  return { ...item, props: { ...item.props, src: "https://cdn/orig.webp", ...props } };
}

function setup(over: { editor?: Editor; furniture?: PageFurnitureItem[]; bake?: BakeFn; userId?: string | undefined } = {}) {
  let furniture = over.furniture ?? [];
  const setFurniture = vi.fn((next: PageFurnitureItem[]) => { furniture = next; });
  const discard = vi.fn();
  const bake = over.bake ?? vi.fn<BakeFn>(async () => ({ url: "https://cdn/bake.webp", hash }));
  const api = usePictureBakes({
    editor: () => over.editor,
    furniture: () => furniture,
    setFurniture,
    userId: () => ("userId" in over ? over.userId : "u1"),
    bake,
    discard,
  });
  return { api, setFurniture, discard, bake, furniture: () => furniture };
}

describe("finding stale bakes", () => {
  it("is stale when the recipe's hash is not what the src was baked for", () => {
    const ed = editorWith({ original: "https://cdn/orig.webp", illuminate: recipe, bakedFor: "old" });
    expect(staleImageNodes(ed.state.doc)).toHaveLength(1);
  });

  it("is current when bakedFor is the recipe's hash", () => {
    const ed = editorWith({ original: "https://cdn/orig.webp", illuminate: recipe, bakedFor: hash });
    expect(staleImageNodes(ed.state.doc)).toEqual([]);
  });

  it("leaves a picture with no recipe, no original or no steps alone", () => {
    const ed = editorWith({}, { illuminate: recipe }, { original: "o", illuminate: { v: 1, seed: 1, steps: [] } });
    expect(staleImageNodes(ed.state.doc)).toEqual([]);
  });

  it("finds stale art furniture by its props, reading the recipe from its JSON text", () => {
    const items = [art({ original: "o.webp", illuminate: JSON.stringify(recipe) }), art({ original: "o.webp", illuminate: JSON.stringify(recipe), bakedFor: hash })];
    expect(staleFurnitureArt(items)).toHaveLength(1);
  });
});

describe("baking stale pictures", () => {
  it("bakes from the original, then sets src and bakedFor on the image node", async () => {
    const ed = editorWith({ src: "https://cdn/orig.webp", original: "https://cdn/orig.webp", illuminate: recipe });
    const { api, bake } = setup({ editor: ed });
    await api.bakeStale();
    expect(bake).toHaveBeenCalledWith("https://cdn/orig.webp", expect.objectContaining({ v: 1 }), "u1");
    expect(imageAttrs(ed)).toMatchObject({ src: "https://cdn/bake.webp", bakedFor: hash, original: "https://cdn/orig.webp" });
  });

  it("writes the result outside undo history, so Undo steps over the author's edits and not the cache refresh", async () => {
    const ed = editorWith({ original: "https://cdn/orig.webp", illuminate: recipe });
    const { api } = setup({ editor: ed });
    const metas: unknown[] = [];
    ed.on("transaction", ({ transaction }) => metas.push(transaction.getMeta("addToHistory")));
    await api.bakeStale();
    expect(metas).toEqual([false]);
  });

  it("bakes two pictures with the same original and recipe once", async () => {
    const attrs = { original: "https://cdn/orig.webp", illuminate: recipe };
    const ed = editorWith(attrs, attrs);
    const { api, bake } = setup({ editor: ed });
    await api.bakeStale();
    expect(bake).toHaveBeenCalledTimes(1);
    expect(imageAttrs(ed, 0)?.bakedFor).toBe(hash);
    expect(imageAttrs(ed, 1)?.bakedFor).toBe(hash);
  });

  it("hands furniture back as the whole updated array, keeping its other props", async () => {
    const item = art({ original: "https://cdn/orig.webp", illuminate: JSON.stringify(recipe), opacity: "40" });
    const { api, setFurniture } = setup({ furniture: [item] });
    await api.bakeStale();
    const next = setFurniture.mock.calls[0][0];
    expect(next[0].id).toBe(item.id);
    expect(next[0].props).toMatchObject({ src: "https://cdn/bake.webp", bakedFor: hash, opacity: "40", original: "https://cdn/orig.webp" });
  });

  it("removes a bake nothing took, when the picture was edited or deleted while it baked", async () => {
    const ed = editorWith({ original: "https://cdn/orig.webp", illuminate: recipe });
    const { api, discard } = setup({
      editor: ed,
      bake: async () => {
        ed.commands.setContent({ type: "doc", content: [{ type: "paragraph" }] });
        return { url: "https://cdn/orphan.webp", hash };
      },
    });
    await api.bakeStale();
    expect(discard).toHaveBeenCalledWith("https://cdn/orphan.webp");
  });

  it("keeps a bake that something took", async () => {
    const ed = editorWith({ original: "https://cdn/orig.webp", illuminate: recipe });
    const { api, discard } = setup({ editor: ed });
    await api.bakeStale();
    expect(discard).not.toHaveBeenCalled();
  });

  it("does not take a result for a recipe the picture no longer has", async () => {
    const ed = editorWith({ original: "https://cdn/orig.webp", illuminate: recipe });
    const changed: IlluminateSettings = { v: 1, seed: 2, steps: [{ type: "mask", url: "https://cdn/other.png" }] };
    let calls = 0;
    const { api, discard } = setup({
      editor: ed,
      bake: async () => {
        // The first bake finishes after the edit; the pass then moves on to the new recipe, which this stub refuses.
        if (++calls > 1) throw new Error("stop");
        ed.commands.updateAttributes("image", { illuminate: changed });
        return { url: "https://cdn/late.webp", hash };
      },
    });
    await api.bakeStale();
    expect(imageAttrs(ed)).toMatchObject({ src: "https://cdn/orig.webp" });
    expect(discard).toHaveBeenCalledWith("https://cdn/late.webp");
  });

  // Fails on: the default discard deleting a bake at once instead of marking it for the sweep (undo may need it).
  it("by default only marks a bake nothing took, leaving the removal to the sweep", async () => {
    const own = "https://x.supabase.co/storage/v1/object/public/asset-images/u1/ill-late.webp";
    for (const url of [own]) {
      vi.mocked(markForSweep).mockClear();
      const ed = editorWith({ original: "https://cdn/orig.webp", illuminate: recipe });
      const changed: IlluminateSettings = { v: 1, seed: 2, steps: [{ type: "mask", url: "https://cdn/other.png" }] };
      let calls = 0;
      const api = usePictureBakes({
        editor: () => ed,
        furniture: () => [],
        setFurniture: vi.fn(),
        userId: () => "u1",
        bake: async () => {
          if (++calls > 1) throw new Error("stop");
          ed.commands.updateAttributes("image", { illuminate: changed });
          return { url, hash };
        },
      });
      await api.bakeStale();
      expect(vi.mocked(markForSweep)).toHaveBeenCalledWith(url);
    }
  });

  it("carries on with the other pictures when one fails, and reports it", async () => {
    const other: IlluminateSettings = { v: 1, seed: 9, steps: [{ type: "mask", url: "https://cdn/two.png" }] };
    const ed = editorWith({ original: "https://cdn/a.webp", illuminate: recipe }, { original: "https://cdn/b.webp", illuminate: other });
    const bake = vi.fn<BakeFn>(async (original) => {
      if (original.endsWith("a.webp")) throw new Error("boom");
      return { url: "https://cdn/b-bake.webp", hash: hashSettings(other) };
    });
    const { api } = setup({ editor: ed, bake });
    await api.bakeStale();
    expect(api.errors.value).toEqual(["boom"]);
    expect(imageAttrs(ed, 1)?.src).toBe("https://cdn/b-bake.webp");
  });

  it("does nothing without a signed-in user, and never runs two passes at once", async () => {
    const ed = editorWith({ original: "https://cdn/orig.webp", illuminate: recipe });
    const none = setup({ editor: ed, userId: undefined });
    await none.api.bakeStale();
    expect(none.bake).not.toHaveBeenCalled();

    let release: () => void = () => {};
    const slow = setup({
      editor: ed,
      bake: () => new Promise((resolve) => { release = () => resolve({ url: "https://cdn/bake.webp", hash }); }),
    });
    const first = slow.api.bakeStale();
    await slow.api.bakeStale();
    expect(slow.api.running.value).toBe(true);
    release();
    await first;
    expect(slow.api.running.value).toBe(false);
  });
});

describe("keeping up with edits", () => {
  // Fails on: an edit made while a bake runs being left stale until the next keystroke, because the pass only looked once.
  it("bakes a picture edited while another bake was running, in the same pass", async () => {
    const other: IlluminateSettings = { v: 1, seed: 3, steps: [{ type: "mask", url: "https://cdn/two.png" }] };
    const ed = editorWith({ original: "https://cdn/a.webp", illuminate: recipe });
    const bake = vi.fn<BakeFn>(async (original) => {
      if (original.endsWith("a.webp")) {
        ed.commands.insertContent({ type: "image", attrs: { src: "https://cdn/b.webp", original: "https://cdn/b.webp", illuminate: other } });
        return { url: "https://cdn/a-bake.webp", hash };
      }
      return { url: "https://cdn/b-bake.webp", hash: hashSettings(other) };
    });
    const { api } = setup({ editor: ed, bake });
    await api.bakeStale();
    expect(bake).toHaveBeenCalledTimes(2);
    expect(api.pending()).toEqual([]);
  });

  // Fails on: a picture whose bake fails being retried on every later edit, which hammers the worker and the bucket.
  it("does not retry a failed bake until its recipe changes", async () => {
    const ed = editorWith({ original: "https://cdn/a.webp", illuminate: recipe });
    const bake = vi.fn<BakeFn>(async () => { throw new Error("boom"); });
    const { api } = setup({ editor: ed, bake });
    await api.bakeStale();
    await api.bakeStale();
    expect(bake).toHaveBeenCalledTimes(1);
    expect(api.pending()).toEqual([]);
    ed.commands.updateAttributes("image", { illuminate: { ...recipe, seed: 5 } });
    expect(api.pending()).toHaveLength(1);
  });

  // Fails on: a failed bake being final, which leaves the edited picture hidden from players with no way back but editing it again.
  it("tries a failed bake again when asked, and clears the error once it lands", async () => {
    vi.useFakeTimers();
    try {
      const ed = editorWith({ original: "https://cdn/a.webp", illuminate: recipe });
      let fail = true;
      const bake = vi.fn<BakeFn>(async () => {
        if (fail) throw new Error("boom");
        return { url: "https://cdn/bake.webp", hash };
      });
      const { api } = setup({ editor: ed, bake });
      await api.bakeStale();
      expect(api.errors.value).toEqual(["boom"]);
      fail = false;
      api.retry();
      await vi.runAllTimersAsync();
      expect(bake).toHaveBeenCalledTimes(2);
      expect(api.errors.value).toEqual([]);
      expect(imageAttrs(ed)).toMatchObject({ src: "https://cdn/bake.webp", bakedFor: hash });
    } finally {
      vi.useRealTimers();
    }
  });

  // Fails on: a bake starting on every slider move, which is the cost the 1.2 s wait exists to avoid.
  it("waits for edits to stop before baking", async () => {
    vi.useFakeTimers();
    try {
      const ed = editorWith({ original: "https://cdn/orig.webp", illuminate: recipe });
      const { api, bake } = setup({ editor: ed });
      api.schedule();
      await vi.advanceTimersByTimeAsync(1000);
      api.schedule();
      await vi.advanceTimersByTimeAsync(1000);
      expect(bake).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(300);
      expect(bake).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
