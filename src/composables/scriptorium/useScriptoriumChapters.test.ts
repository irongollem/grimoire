import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, ref } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises } from "@vue/test-utils";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "user-1" }) }));

import {
  useBookChapterList,
  useBookChaptersFull,
  useCreateChapter,
  useDeleteChapter,
  useReorderChapters,
  useSaveChapter,
  useScriptoriumChapter,
} from "./useScriptoriumChapters";
import type { ScriptoriumChapterSummary } from "@/types/scriptorium.types";

function mountWith<T>(setup: (client: QueryClient) => T): { api: T; client: QueryClient } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let api!: T;
  const app = createApp(defineComponent({ setup() { api = setup(client); return () => h("div"); } }));
  app.use(VueQueryPlugin, { queryClient: client });
  app.mount(document.createElement("div"));
  return { api, client };
}

const para = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (...content: object[]) => ({ type: "doc", content });
const row = (id: string, document_id: string, position: number, over: Record<string, unknown> = {}) => ({
  id, document_id, position, title: id, content: doc(para(id)), word_count: 1,
  created_at: `2026-01-0${position + 1}`, updated_at: "2026-01-01", ...over,
});

beforeEach(() => {
  fake.reset();
  fake.seed("scriptorium_chapters", [
    row("b-two", "book-1", 1),
    row("b-one", "book-1", 0),
    row("other", "book-2", 0),
  ]);
});

describe("chapter reads", () => {
  it("lists only this book's chapters in position order, without bodies", async () => {
    const { api } = mountWith(() => useBookChapterList("book-1"));
    await flushPromises();
    expect(api.data.value?.map((c) => c.id)).toEqual(["b-one", "b-two"]);
    expect((fake.calls[0]?.columns ?? "").split(/,\s*/)).not.toContain("content");
    expect((fake.calls[0]?.columns ?? "").split(/,\s*/)).not.toContain("*");
  });

  it("reads every body of this book only, and waits while disabled", async () => {
    const enabled = ref(false);
    const { api } = mountWith(() => useBookChaptersFull("book-1", { enabled }));
    await flushPromises();
    expect(fake.calls).toEqual([]);
    enabled.value = true;
    await flushPromises();
    expect(api.data.value?.map((c) => c.id)).toEqual(["b-one", "b-two"]);
    expect(api.data.value?.[0].content).toEqual(doc(para("b-one")));
  });

  it("throws a failed read instead of showing an empty book", async () => {
    fake.failNext("scriptorium_chapters", { message: "boom" });
    const { api } = mountWith(() => useBookChapterList("book-1"));
    await flushPromises();
    expect(api.isError.value).toBe(true);
    expect(api.data.value).toBeUndefined();
  });

  it("opens one chapter with its body", async () => {
    const { api } = mountWith(() => useScriptoriumChapter("b-two"));
    await flushPromises();
    expect(api.data.value?.content).toEqual(doc(para("b-two")));
  });
});

describe("useCreateChapter", () => {
  it("appends after the highest position and fills in title and word count", async () => {
    fake.seed("scriptorium_chapters", [row("b-gap", "book-1", 5)]);
    const { api } = mountWith(() => useCreateChapter());
    const heading = { type: "heading", content: [{ type: "text", text: "Fresh" }] };
    await api.mutateAsync({ documentId: "book-1", content: doc(heading, para("two words")) });
    const created = fake.rows("scriptorium_chapters").find((c) => c.title === "Fresh");
    expect(created).toMatchObject({ document_id: "book-1", position: 6, word_count: 3 });
  });

  it("starts the first chapter of an empty book at position 0 with an empty paragraph", async () => {
    const { api } = mountWith(() => useCreateChapter());
    await api.mutateAsync({ documentId: "book-9" });
    expect(fake.rows("scriptorium_chapters").find((c) => c.document_id === "book-9")).toMatchObject({
      position: 0,
      content: doc({ type: "paragraph" }),
    });
  });
});

describe("useSaveChapter", () => {
  it("writes content, title and word count, and puts the answer into the chapter cache without refetching it", async () => {
    const heading = { type: "heading", content: [{ type: "text", text: "Renamed" }] };
    const { api, client } = mountWith(() => ({ save: useSaveChapter(), chapter: useScriptoriumChapter("b-one") }));
    await flushPromises();
    fake.calls.length = 0;
    await api.save.mutateAsync({ id: "b-one", documentId: "book-1", content: doc(heading, para("x y")) });
    await flushPromises();
    expect(fake.rows("scriptorium_chapters").find((c) => c.id === "b-one")).toMatchObject({ title: "Renamed", word_count: 3 });
    expect(client.getQueryData<{ title: string }>(["scriptorium-chapter", "b-one"])?.title).toBe("Renamed");
    // A refetch of the chapter under the typist would clobber what was typed after the save left.
    expect(fake.calls.some((c) => c.op === "select" && (c.filters.some((f) => String(f.column) === "id")))).toBe(false);
  });

  it("updates the chapter list row in place", async () => {
    const { api, client } = mountWith(() => ({ list: useBookChapterList("book-1"), save: useSaveChapter() }));
    await flushPromises();
    await api.save.mutateAsync({ id: "b-two", documentId: "book-1", content: doc({ type: "heading", content: [{ type: "text", text: "Z" }] }) });
    expect(client.getQueryData<ScriptoriumChapterSummary[]>(["scriptorium", "book-1", "chapters"])?.map((c) => c.title)).toEqual(["b-one", "Z"]);
  });

  // #1115: invalidating the bodies re-downloaded the whole book (1.86 MB) on every autosave.
  it("patches the saved chapter into the whole book's bodies without downloading them again", async () => {
    const { api, client } = mountWith(() => ({ full: useBookChaptersFull("book-1"), save: useSaveChapter() }));
    await flushPromises();
    fake.calls.length = 0;
    await api.save.mutateAsync({ id: "b-two", documentId: "book-1", content: doc(para("new words")) });
    await flushPromises();
    const bodies = client.getQueryData<{ id: string; word_count: number }[]>(["scriptorium", "book-1", "chapters", "full"]);
    expect(bodies?.find((c) => c.id === "b-two")?.word_count).toBe(2);
    expect(fake.calls.some((c) => c.op === "select" && c.target === "scriptorium_chapters")).toBe(false);
  });
});

describe("useDeleteChapter", () => {
  it("refuses to delete the only chapter of a book", async () => {
    const { api } = mountWith(() => useDeleteChapter());
    await expect(api.mutateAsync({ id: "other", documentId: "book-2" })).rejects.toThrow(/at least one chapter/);
    expect(fake.rows("scriptorium_chapters").map((c) => c.id)).toContain("other");
  });

  it("deletes the named chapter of a book with several and leaves the rest", async () => {
    const { api } = mountWith(() => useDeleteChapter());
    await api.mutateAsync({ id: "b-one", documentId: "book-1" });
    expect(fake.rows("scriptorium_chapters").map((c) => c.id).sort()).toEqual(["b-two", "other"]);
  });
});

describe("useReorderChapters", () => {
  const listKey = ["scriptorium", "book-1", "chapters"];

  it("writes new positions and shows the new order at once", async () => {
    const { api, client } = mountWith(() => ({ list: useBookChapterList("book-1"), reorder: useReorderChapters() }));
    await flushPromises();
    await api.reorder.mutateAsync({ documentId: "book-1", orderedIds: ["b-two", "b-one"] });
    expect(fake.rows("scriptorium_chapters").filter((c) => c.document_id === "book-1").map((c) => [c.id, c.position]).sort())
      .toEqual([["b-one", 1], ["b-two", 0]]);
    expect(fake.rows("scriptorium_chapters").find((c) => c.id === "other")?.position).toBe(0);
    expect(client.getQueryData<ScriptoriumChapterSummary[]>(listKey)?.[0].id).toBe("b-two");
  });

  it("does not write rows whose position is already right", async () => {
    const { api } = mountWith(() => ({ list: useBookChapterList("book-1"), reorder: useReorderChapters() }));
    await flushPromises();
    fake.calls.length = 0;
    await api.reorder.mutateAsync({ documentId: "book-1", orderedIds: ["b-one", "b-two"] });
    expect(fake.calls.filter((c) => c.op === "update")).toEqual([]);
  });

  it("puts the old order back when the write fails", async () => {
    const { api, client } = mountWith(() => ({ list: useBookChapterList("book-1"), reorder: useReorderChapters() }));
    await flushPromises();
    // The first call is the diff read; fail the first update after it.
    fake.failNext("scriptorium_chapters", { message: "boom" }, { after: 1 });
    // After the failure the settle-time refetch must not repair the cache for us: stop it.
    const settled = vi.spyOn(client, "invalidateQueries").mockResolvedValue();
    await expect(api.reorder.mutateAsync({ documentId: "book-1", orderedIds: ["b-two", "b-one"] })).rejects.toMatchObject({ message: "boom" });
    expect(client.getQueryData<ScriptoriumChapterSummary[]>(listKey)?.map((c) => c.id)).toEqual(["b-one", "b-two"]);
    settled.mockRestore();
  });
});
