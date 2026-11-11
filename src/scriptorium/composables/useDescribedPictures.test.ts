// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { shallowRef } from "vue";
import { Editor } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
import { PageFlow } from "@/scriptorium/tiptap/pageFlow";
import { useEditorPictures } from "./useEditorPictures";
import { useDescribedPictures } from "./useDescribedPictures";
import type { PageFurnitureItem } from "@/scriptorium/types";

const toastError = vi.fn();
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: toastError }) }));
vi.mock("@/ai/useImageJob", () => ({ waitForImageJob: vi.fn() }));
vi.mock("@/ai/useChroniclerImageGeneration", () => ({ getLocalImageJob: vi.fn() }));

let editor: Editor | null = null;
afterEach(() => {
  editor?.destroy();
  editor = null;
  toastError.mockClear();
});

const para = (id: string, text = "text") => ({ type: "paragraph", attrs: { blockId: id }, content: [{ type: "text", text }] });
const image = (id: string, extra: object = {}) => ({ type: "image", attrs: { blockId: id, src: "old.webp", ...extra } });

function setup(content: object[], furniture: PageFurnitureItem[] = []) {
  const ed = new Editor({
    element: document.createElement("div"),
    content: { type: "doc", content },
    extensions: [...createScriptoriumExtensions(), PageFlow],
  });
  editor = ed;
  const state = { furniture };
  const pictures = useEditorPictures({
    editor: shallowRef<Editor | undefined>(ed),
    chapterId: () => "c1",
    geometry: () => ({ width: 800, height: 1123, marginTop: 96 }),
    furniture: () => state.furniture,
    setFurniture: (items) => {
      state.furniture = items;
    },
    select: () => undefined,
    sheet: () => document.createElement("div"),
  });
  return { ed, state, pictures };
}

function deferred() {
  let resolve!: (url: string) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<string>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const imageAttrs = (ed: Editor) => ed.getJSON().content?.find((n) => n.type === "image")?.attrs ?? {};

describe("useDescribedPictures", () => {
  // Fails on: landing by position, so text typed above the picture while it painted puts the file on the wrong node.
  it("lands the painted file and its crop on the picture even after text was added above it", async () => {
    const { ed, pictures } = setup([para("b1"), image("img1")]);
    const job = deferred();
    const described = useDescribedPictures({ pictures, pageAspect: () => 1 / 1.414, wait: () => job.promise });
    const target = pictures.targetOf({ source: "node", blockId: "img1" });
    if (!target) throw new Error("no picture");
    described.start(target, { jobId: "j1", shape: "banner" });
    expect(imageAttrs(ed)).toMatchObject({ pendingJob: "j1", pendingShape: "banner" });

    ed.commands.insertContentAt(0, para("new", "typed while it painted"));
    job.resolve("painted.webp");
    await vi.waitFor(() => expect(imageAttrs(ed).pendingJob).toBeNull());

    expect(imageAttrs(ed)).toMatchObject({ src: "painted.webp", original: "painted.webp", pendingShape: null });
    const recipe = imageAttrs(ed).illuminate as { steps: { type: string; h: number }[] };
    expect(recipe.steps).toEqual([{ type: "crop", x: 0, y: 0.25, w: 1, h: 0.5 }]);
    expect(imageAttrs(ed).bakedFor).toBeNull();
  });

  // Fails on: a shape that needs no cut still getting a recipe, so the bake runs for nothing.
  it("writes no recipe for a shape the model paints as it is", async () => {
    const { ed, pictures } = setup([image("img1")]);
    const described = useDescribedPictures({ pictures, pageAspect: () => 0.7, wait: async () => "painted.webp" });
    const target = pictures.targetOf({ source: "node", blockId: "img1" });
    if (!target) throw new Error("no picture");
    described.start(target, { jobId: "j1", shape: "landscape" });
    await vi.waitFor(() => expect(imageAttrs(ed).pendingJob).toBeNull());
    expect(imageAttrs(ed)).toMatchObject({ src: "painted.webp", illuminate: null });
  });

  // Fails on: a failed paint leaving the picture marked as painting for ever, with nothing said.
  it("clears the mark and says so when the job fails", async () => {
    const { ed, pictures } = setup([image("img1")]);
    const described = useDescribedPictures({ pictures, pageAspect: () => 0.7, wait: () => Promise.reject(new Error("Image generation failed")) });
    const target = pictures.targetOf({ source: "node", blockId: "img1" });
    if (!target) throw new Error("no picture");
    described.start(target, { jobId: "j1", shape: "tall" });
    await vi.waitFor(() => expect(toastError).toHaveBeenCalledWith("The picture could not be painted: Image generation failed"));
    expect(imageAttrs(ed)).toMatchObject({ src: "old.webp", pendingJob: null });
  });

  // Fails on: a picture deleted mid-paint making the landing write onto some other node, or throw.
  it("drops the result quietly when the picture is gone", async () => {
    const { ed, pictures } = setup([para("b1"), image("img1")]);
    const job = deferred();
    const described = useDescribedPictures({ pictures, pageAspect: () => 0.7, wait: () => job.promise });
    const target = pictures.targetOf({ source: "node", blockId: "img1" });
    if (!target) throw new Error("no picture");
    described.start(target, { jobId: "j1", shape: "tall" });
    pictures.remove(target);
    job.resolve("painted.webp");
    await vi.waitFor(() => expect(ed.getJSON().content?.some((n) => n.type === "image")).toBe(false));
    expect(toastError).not.toHaveBeenCalled();
  });

  // Fails on: a reload mid-paint leaving the picture marked for ever, because nothing waits for its job again.
  it("resumes a picture that still carries a job, once", async () => {
    const { ed, pictures } = setup([image("img1", { pendingJob: "j9", pendingShape: "tall" })]);
    const wait = vi.fn(async () => "painted.webp");
    const described = useDescribedPictures({ pictures, pageAspect: () => 0.7, wait });
    described.resume();
    described.resume();
    await vi.waitFor(() => expect(imageAttrs(ed).pendingJob).toBeNull());
    expect(wait).toHaveBeenCalledTimes(1);
    expect(imageAttrs(ed).src).toBe("painted.webp");
  });

  // Fails on: art on a page not being landed on, because only image nodes were looked for.
  it("lands on art placed on the page by its own id", async () => {
    const item: PageFurnitureItem = {
      id: "f1", kind: "art", anchor: { type: "block", blockId: "b1" }, x: 0, y: 0, width: 50, z: "over",
      props: { src: "old.webp", pendingJob: "j2", pendingShape: "column" },
    };
    const { state, pictures } = setup([para("b1")], [item]);
    const described = useDescribedPictures({ pictures, pageAspect: () => 0.7, wait: async () => "painted.webp" });
    described.resume();
    await vi.waitFor(() => expect(state.furniture[0].props.pendingJob).toBeUndefined());
    expect(state.furniture[0].props).toMatchObject({ src: "painted.webp", original: "painted.webp" });
    expect(String(state.furniture[0].props.illuminate)).toContain('"crop"');
    expect(state.furniture[0].props.pendingShape).toBeUndefined();
  });
});
