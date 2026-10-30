import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import type { BookLayoutResult } from "@/lib/scriptorium/bookLayout/types";
import type { ScriptoriumChapterSummary, ScriptoriumNote } from "@/types/scriptorium.types";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), del: vi.fn() }));
const notesData = vi.hoisted(() => ({ value: [] as unknown[] }));

vi.mock("@/composables/scriptorium/useScriptoriumNotes", async () => {
  const { ref: vueRef } = await import("vue");
  const data = vueRef(notesData.value);
  notesData.value = data as unknown as unknown[];
  return {
    useBookNotes: () => ({ data, isPending: vueRef(false), error: vueRef(null) }),
    useCreateNote: () => ({ mutateAsync: mocks.create, isPending: vueRef(false) }),
    useUpdateNote: () => ({ mutateAsync: mocks.update, isPending: vueRef(false) }),
    useDeleteNote: () => ({ mutateAsync: mocks.del, isPending: vueRef(false) }),
  };
});

import { clearInspectPlacements } from "@/lib/scriptorium/inspect/notesState";
import InspectNotesDrawer from "./InspectNotesDrawer.vue";
import InspectNotesLayer from "./InspectNotesLayer.vue";

const setNotes = (list: ScriptoriumNote[]) => {
  (notesData.value as unknown as { value: ScriptoriumNote[] }).value = list;
};
const note = (id: string, chapter_id: string, block_id: string | null, over: Partial<ScriptoriumNote> = {}): ScriptoriumNote => ({
  id, user_id: "me", document_id: "book", chapter_id, block_id, body: `body ${id}`, done: false, created_at: id, updated_at: id, ...over,
});
const chapters: ScriptoriumChapterSummary[] = [
  { id: "c1", document_id: "book", position: 0, title: "Welcome", word_count: 0, created_at: "", updated_at: "" },
  { id: "c2", document_id: "book", position: 1, title: "The Spiral's Heart", word_count: 0, created_at: "", updated_at: "" },
];
const layout = (labels: (string | null)[] = []): BookLayoutResult =>
  ({ pageCount: labels.length, pages: labels.map((label, globalIndex) => ({ label, globalIndex })), chapters: [], laidOutChapterIds: [], layoutMs: 0 }) as unknown as BookLayoutResult;

function page(chapterId: string, blocks: string[], blank = false): HTMLElement {
  const el = document.createElement("div");
  el.className = "pagedjs_page";
  el.setAttribute("data-chapter-id", chapterId);
  if (blank) el.setAttribute("data-blank-page", "");
  for (const id of blocks) {
    const block = document.createElement("p");
    block.setAttribute("data-block-id", id);
    block.textContent = `text ${id}`;
    el.append(block);
  }
  return el;
}
let host: HTMLElement;
let wrapper: VueWrapper;
const pinsOn = (el: Element) => Array.from(el.querySelectorAll("[data-inspect-pin]")).map((p) => p.textContent?.trim());

function mountLayer(result = layout()) {
  wrapper = mount(InspectNotesLayer, { attachTo: document.body, props: { documentId: "book", host, result, chapters } });
}

beforeEach(() => {
  vi.clearAllMocks();
  setNotes([]);
  clearInspectPlacements("book");
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
});

describe("starting a note", () => {
  it("pins nothing for a click on a blank page", async () => {
    host.append(page("c1", ["b1"]), page("c1", [], true));
    mountLayer();
    (host.children[1] as HTMLElement).click();
    await flushPromises();
    expect(document.body.querySelector("[data-slip]")).toBeNull();
    expect(pinsOn(host)).toEqual([]);
  });

  it("pins to the clicked block, in the DM's hand, and keeps the text with Save", async () => {
    host.append(page("c1", ["b1", "b2"]));
    mountLayer();
    (host.querySelector('[data-block-id="b2"]') as HTMLElement).click();
    await flushPromises();
    const area = document.body.querySelector("textarea")!;
    expect(area.hasAttribute("data-hand")).toBe(true);
    area.value = "  too dark  ";
    area.dispatchEvent(new Event("input"));
    await flushPromises();
    const save = Array.from(document.body.querySelectorAll("[data-slip] button")).find((b) => b.textContent?.includes("Save")) as HTMLButtonElement;
    save.click();
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith({ documentId: "book", chapterId: "c1", blockId: "b2", body: "too dark" });
  });

  it("falls back to the page's first block when the click lands on bare paper", async () => {
    host.append(page("c1", ["b1", "b2"]));
    mountLayer();
    (host.firstElementChild as HTMLElement).click();
    await flushPromises();
    document.body.querySelector("textarea")!.value = "x";
    document.body.querySelector("textarea")!.dispatchEvent(new Event("input"));
    await flushPromises();
    (Array.from(document.body.querySelectorAll("[data-slip] button")).find((b) => b.textContent?.includes("Save")) as HTMLButtonElement).click();
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ blockId: "b1" }));
  });

  it("Escape cancels without saving", async () => {
    host.append(page("c1", ["b1"]));
    mountLayer();
    (host.querySelector('[data-block-id="b1"]') as HTMLElement).click();
    await flushPromises();
    document.body.querySelector("[data-slip]")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flushPromises();
    expect(document.body.querySelector("[data-slip]")).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("pins", () => {
  it("a note follows its block to the new page after a re-layout", async () => {
    const first = page("c1", ["b1", "b9"]);
    const second = page("c1", ["b2"]);
    host.append(first, second);
    setNotes([note("n1", "c1", "b9")]);
    mountLayer(layout(["1", "2"]));
    await flushPromises();
    expect(pinsOn(first)).toEqual(["1"]);

    second.append(host.querySelector('[data-block-id="b9"]')!); // the text grew; the block moved on
    await wrapper.setProps({ result: layout(["1", "2"]) });
    await flushPromises();
    expect(pinsOn(first)).toEqual([]);
    expect(pinsOn(second)).toEqual(["1"]);
  });

  it("pins a note whose block is gone to its chapter's first page", async () => {
    const a = page("c1", ["b1"]);
    const b = page("c2", ["z1"]);
    const c = page("c2", ["z2"]);
    host.append(a, b, c);
    setNotes([note("gone", "c2", "deleted"), note("nobody", "c2", null, { created_at: "z" })]);
    mountLayer();
    await flushPromises();
    expect(pinsOn(a)).toEqual([]);
    expect(pinsOn(b)).toEqual(["1", "2"]);
    expect(pinsOn(c)).toEqual([]);
  });

  it("numbers pins in book order and hides done notes", async () => {
    const a = page("c1", ["b1"]);
    const b = page("c2", ["z1"]);
    host.append(a, b);
    setNotes([note("late", "c2", "z1"), note("early", "c1", "b1"), note("finished", "c1", "b1", { done: true })]);
    mountLayer();
    await flushPromises();
    expect(pinsOn(a)).toEqual(["1"]);
    expect(pinsOn(b)).toEqual(["2"]);
  });

  it("opens a pin with the note, 'Edit this part' emits the block, and Done marks it", async () => {
    host.append(page("c1", ["b1"]));
    setNotes([note("n1", "c1", "b1")]);
    mountLayer();
    await flushPromises();
    (host.querySelector("[data-inspect-pin]") as HTMLElement).click();
    await flushPromises();
    expect(document.body.querySelector("[data-slip]")!.textContent).toContain("body n1");
    const press = (label: string) => (Array.from(document.body.querySelectorAll("[data-slip] button")).find((b) => b.textContent?.includes(label)) as HTMLButtonElement).click();
    press("Edit this part");
    expect(wrapper.emitted("editBlock")).toEqual([[{ chapterId: "c1", blockId: "b1" }]]);
    (host.querySelector("[data-inspect-pin]") as HTMLElement).click();
    await flushPromises();
    press("Done");
    await flushPromises();
    expect(mocks.update).toHaveBeenCalledWith({ id: "n1", done: true });
  });

  it("says why a blank page is blank, naming the chapter that follows", async () => {
    const blank = page("c1", [], true);
    host.append(page("c1", ["b1"]), blank, page("c2", ["z1"]));
    mountLayer();
    await flushPromises();
    expect(blank.textContent).toContain("Left blank so The Spiral's Heart opens on a right-hand page. This note is not printed.");
  });

  it("removes every overlay node when it unmounts, so the export never sees one", async () => {
    host.append(page("c1", ["b1"]), page("c1", [], true));
    setNotes([note("n1", "c1", "b1")]);
    mountLayer();
    await flushPromises();
    expect(host.querySelectorAll("[data-inspect-overlay]").length).toBeGreaterThan(0);
    wrapper.unmount();
    expect(host.querySelectorAll("[data-inspect-overlay]").length).toBe(0);
  });
});

describe("the drawer", () => {
  function mountBoth(result = layout(["193", "194"])) {
    host.append(page("c1", ["b1"]), page("c2", ["z1"]));
    mountLayer(result);
    return mount(InspectNotesDrawer, { attachTo: document.body, props: { documentId: "book", chapters, result } });
  }

  it("lists open notes in book order with the printed page, and counts done ones", async () => {
    setNotes([note("late", "c2", "z1"), note("early", "c1", "b1"), note("finished", "c1", "b1", { done: true })]);
    const drawer = mountBoth();
    await flushPromises();
    const rows = drawer.findAll("ol li");
    expect(rows.map((r) => r.text())).toEqual([
      "1 · Page 193 · Welcomebody early",
      "2 · Page 194 · The Spiral's Heartbody late",
    ]);
    expect(drawer.text()).toContain("1 done note hidden");
    drawer.unmount();
  });

  it("Show reveals the done notes, on the pages too", async () => {
    const pageEl = page("c1", ["b1"]);
    host.append(pageEl);
    setNotes([note("finished", "c1", "b1", { done: true })]);
    mountLayer();
    const drawer = mount(InspectNotesDrawer, { attachTo: document.body, props: { documentId: "book", chapters, result: layout(["1"]) } });
    await flushPromises();
    expect(drawer.find("ol").text()).toBe("No notes yet.");
    expect(pinsOn(pageEl)).toEqual([]);
    await drawer.findAll("button").find((b) => b.text() === "Show")!.trigger("click");
    await flushPromises();
    expect(drawer.findAll("ol li").map((r) => r.text()).join()).toContain("body finished");
    expect(pinsOn(pageEl)).toEqual(["1"]);
    drawer.unmount();
  });

  it("omits the page while the note's block cannot be located, and tells the shell where to go", async () => {
    setNotes([note("n1", "c2", "z1")]);
    const drawer = mount(InspectNotesDrawer, { attachTo: document.body, props: { documentId: "book", chapters, result: null } });
    await flushPromises();
    expect(drawer.find("ol li").text()).toContain("1 · The Spiral's Heart");
    await drawer.find("ol li button").trigger("click");
    expect(drawer.emitted("goToNote")).toEqual([[{ chapterId: "c2", blockId: "z1" }]]);
    drawer.unmount();
  });
});
