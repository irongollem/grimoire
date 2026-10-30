import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import type { ScriptoriumChapter, ScriptoriumChapterSummary } from "@/types/scriptorium.types";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  del: vi.fn(),
  reorder: vi.fn(),
  refetch: vi.fn(),
  removeImages: vi.fn(),
}));

vi.mock("@/composables/scriptorium/useScriptoriumChapters", () => ({
  useCreateChapter: () => ({ mutateAsync: mocks.create, isPending: ref(false) }),
  useDeleteChapter: () => ({ mutateAsync: mocks.del }),
  useReorderChapters: () => ({ mutateAsync: mocks.reorder }),
  useBookChaptersFull: () => ({ data: ref(undefined), refetch: mocks.refetch }),
}));
vi.mock("@/composables/useImageUpload", () => ({ removeRichTextImages: mocks.removeImages }));

import { useConfirm } from "@/composables/useConfirm";
import ChapterRail from "./ChapterRail.vue";

const chapter = (id: string, position: number, title: string, words = 100): ScriptoriumChapterSummary => ({
  id, document_id: "book", position, title, word_count: words, created_at: "", updated_at: "",
});
const three = [chapter("a", 0, "Welcome", 1200), chapter("b", 1, "Peoples", 4390), chapter("c", 2, "")];
const ranges = { a: { first: "5", last: "49" }, b: { first: "51", last: "51" } };

let wrapper: VueWrapper;
function mountRail(over: Record<string, unknown> = {}) {
  const beforeLeave = vi.fn().mockResolvedValue(undefined);
  wrapper = mount(ChapterRail, {
    attachTo: document.body,
    props: { documentId: "book", chapters: three, currentId: "b", pageRanges: ranges, beforeLeave, ...over },
  });
  return { beforeLeave };
}
const selected = () => (wrapper.emitted("select") ?? []).map((e) => e[0]);

async function openMenu(title: string) {
  await wrapper.find(`button[aria-label="Actions for ${title}"]`).trigger("click");
  await flushPromises();
}
function menuItem(label: string): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')).find((b) => b.textContent?.includes(label));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({ id: "new" });
  mocks.del.mockResolvedValue(undefined);
  mocks.reorder.mockResolvedValue(undefined);
  mocks.refetch.mockResolvedValue({ data: [{ id: "b", content: { type: "doc" } }] as ScriptoriumChapter[] });
});
afterEach(() => {
  wrapper.unmount();
  document.body.innerHTML = "";
});

describe("rows", () => {
  it("names an empty chapter 'Untitled chapter', marks the open one and omits unknown pages", () => {
    mountRail();
    const rows = wrapper.findAll("[data-chapter-row]");
    expect(rows[2].text()).toContain("Untitled chapter");
    expect(rows[2].text()).not.toContain("Page");
    expect(rows[0].text()).toContain("Pages 5 to 49");
    expect(rows[1].text()).toContain("Page 51");
    expect(rows[1].find("button[aria-current='page']").exists()).toBe(true);
    expect(rows[0].find("[aria-current]").exists()).toBe(false);
  });
});

describe("selecting", () => {
  it("waits for beforeLeave to settle before telling the shell", async () => {
    let release!: () => void;
    const { beforeLeave } = mountRail({ beforeLeave: vi.fn(() => new Promise<void>((r) => (release = r))) });
    void beforeLeave;
    await wrapper.findAll("[data-chapter-row] button[class*='flex-col']")[0].trigger("click");
    expect(selected()).toEqual([]);
    release();
    await flushPromises();
    expect(selected()).toEqual(["a"]);
  });

  it("stays on the open chapter when beforeLeave rejects", async () => {
    mountRail({ beforeLeave: vi.fn().mockRejectedValue(new Error("offline")) });
    await wrapper.findAll("[data-chapter-row] button[class*='flex-col']")[0].trigger("click");
    await flushPromises();
    expect(selected()).toEqual([]);
  });
});

describe("adding", () => {
  it("creates a chapter opening on an empty level-1 heading, settles the open one, then selects it", async () => {
    const { beforeLeave } = mountRail();
    await wrapper.findAll("button").find((b) => b.text().includes("Add chapter"))!.trigger("click");
    await flushPromises();
    expect(mocks.create).toHaveBeenCalledWith({
      documentId: "book",
      content: { type: "doc", content: [{ type: "heading", attrs: { level: 1 } }] },
    });
    expect(beforeLeave).toHaveBeenCalled();
    expect(selected()).toEqual(["new"]);
  });
});

describe("deleting", () => {
  async function clickDelete(title: string) {
    await openMenu(title);
    menuItem("Delete chapter")!.click();
    await flushPromises();
  }

  it("asks with the chapter's name and word count, and a cancel deletes nothing", async () => {
    mountRail();
    await clickDelete("Peoples");
    const { dialog, _resolve } = useConfirm();
    expect(dialog.value).toMatchObject({
      title: "Delete Chapter?",
      confirmLabel: "Delete chapter",
      message: '"Peoples" and its 4,390 words will be removed from the book. This cannot be undone.',
    });
    _resolve(false);
    await flushPromises();
    expect(mocks.del).not.toHaveBeenCalled();
    expect(selected()).toEqual([]);
  });

  it("deleting the open chapter selects the next one, cleans its images, and the last selects the previous", async () => {
    mountRail();
    await clickDelete("Peoples");
    useConfirm()._resolve(true);
    await flushPromises();
    expect(mocks.del).toHaveBeenCalledWith({ id: "b", documentId: "book" });
    expect(mocks.removeImages).toHaveBeenCalledWith(JSON.stringify({ type: "doc" }));
    expect(selected()).toEqual(["c"]);
  });

  it("selects the previous chapter when the last one is deleted", async () => {
    mountRail({ currentId: "c" });
    mocks.refetch.mockResolvedValue({ data: [{ id: "c", content: { type: "doc" } }] });
    await clickDelete("Untitled chapter");
    useConfirm()._resolve(true);
    await flushPromises();
    expect(selected()).toEqual(["b"]);
  });

  it("deleting another chapter leaves the open one alone", async () => {
    mountRail();
    mocks.refetch.mockResolvedValue({ data: [{ id: "a", content: { type: "doc" } }] });
    await clickDelete("Welcome");
    useConfirm()._resolve(true);
    await flushPromises();
    expect(mocks.del).toHaveBeenCalled();
    expect(selected()).toEqual([]);
  });

  it("offers no delete for the only chapter", async () => {
    mountRail({ chapters: [chapter("a", 0, "Welcome")], currentId: "a" });
    await openMenu("Welcome");
    expect(menuItem("Move up")).toBeDefined();
    expect(menuItem("Delete chapter")).toBeUndefined();
  });

  it("keeps the images and the selection when the delete fails", async () => {
    mountRail();
    mocks.del.mockRejectedValue(new Error("A book needs at least one chapter."));
    await clickDelete("Peoples");
    useConfirm()._resolve(true);
    await flushPromises();
    expect(mocks.removeImages).not.toHaveBeenCalled();
    expect(selected()).toEqual([]);
    expect(wrapper.text()).toContain("A book needs at least one chapter.");
  });
});

describe("moving", () => {
  it("Move down in the menu sends the new order, and the first chapter cannot move up", async () => {
    mountRail();
    await openMenu("Welcome");
    expect(menuItem("Move up")!.disabled).toBe(true);
    menuItem("Move down")!.click();
    await flushPromises();
    expect(mocks.reorder).toHaveBeenCalledWith({ documentId: "book", orderedIds: ["b", "a", "c"] });
  });

  function stubRows() {
    wrapper.findAll("[data-chapter-row]").forEach((row, at) => {
      row.element.getBoundingClientRect = () => ({ top: at * 40, height: 40 }) as DOMRect;
    });
  }
  const pointer = (type: string, y: number) => window.dispatchEvent(Object.assign(new Event(type), { clientY: y, button: 0 }));

  it("dropping a grip below another row reorders; dropping where it started writes nothing", async () => {
    mountRail();
    stubRows();
    await wrapper.findAll("[data-chapter-grip]")[0].trigger("pointerdown", { button: 0 });
    pointer("pointermove", 110);
    pointer("pointerup", 110);
    await flushPromises();
    expect(mocks.reorder).toHaveBeenCalledWith({ documentId: "book", orderedIds: ["b", "c", "a"] });

    mocks.reorder.mockClear();
    await wrapper.findAll("[data-chapter-grip]")[1].trigger("pointerdown", { button: 0 });
    pointer("pointerup", 60);
    await flushPromises();
    expect(mocks.reorder).not.toHaveBeenCalled();
  });

  it("Escape abandons a drag", async () => {
    mountRail();
    stubRows();
    await wrapper.findAll("[data-chapter-grip]")[0].trigger("pointerdown", { button: 0 });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    pointer("pointerup", 110);
    await flushPromises();
    expect(mocks.reorder).not.toHaveBeenCalled();
  });

  it("says so when the reorder fails (the composable rolls the rows back)", async () => {
    mountRail();
    mocks.reorder.mockRejectedValue(new Error("offline"));
    await openMenu("Welcome");
    menuItem("Move down")!.click();
    await flushPromises();
    expect(wrapper.text()).toContain("offline");
  });
});
