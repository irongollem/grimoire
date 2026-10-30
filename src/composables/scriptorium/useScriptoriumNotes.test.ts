import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h } from "vue";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { flushPromises } from "@vue/test-utils";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "me" }) }));

import { useBookNotes, useCreateNote, useDeleteNote, useUpdateNote } from "./useScriptoriumNotes";

function mountWith<T>(setup: () => T): T {
  let api!: T;
  const app = createApp(defineComponent({ setup() { api = setup(); return () => h("div"); } }));
  app.use(VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) });
  app.mount(document.createElement("div"));
  return api;
}

const note = (id: string, user_id: string, document_id: string, over: Record<string, unknown> = {}) => ({
  id, user_id, document_id, chapter_id: "c1", block_id: null, body: id, done: false, created_at: `2026-01-0${id.length}`, ...over,
});

beforeEach(() => {
  fake.reset();
  fake.seed("scriptorium_notes", [
    note("n1", "me", "book-1"),
    note("n22", "co-dm", "book-1"),
    note("n333", "me", "book-2"),
  ]);
});

describe("useBookNotes", () => {
  it("returns my notes on this book only, not a co-DM's on the same book or mine on another", async () => {
    const api = mountWith(() => useBookNotes("book-1"));
    await flushPromises();
    expect(api.data.value?.map((n) => n.id)).toEqual(["n1"]);
  });
});

describe("note mutations", () => {
  it("creates a note for me on a block, and a book-level one with no block", async () => {
    const api = mountWith(() => useCreateNote());
    await api.mutateAsync({ documentId: "book-1", chapterId: "c1", blockId: "b9", body: "fix this" });
    await api.mutateAsync({ documentId: "book-1", chapterId: "c1", blockId: null, body: "general" });
    const mine = fake.rows("scriptorium_notes").filter((n) => n.body === "fix this" || n.body === "general");
    expect(mine.map((n) => [n.user_id, n.block_id])).toEqual([["me", "b9"], ["me", null]]);
  });

  it("updates only the fields given", async () => {
    const api = mountWith(() => useUpdateNote());
    await api.mutateAsync({ id: "n1", done: true });
    expect(fake.rows("scriptorium_notes").find((n) => n.id === "n1")).toMatchObject({ done: true, body: "n1" });
  });

  it("will not update or delete somebody else's note", async () => {
    const update = mountWith(() => useUpdateNote());
    await expect(update.mutateAsync({ id: "n22", body: "hijack" })).rejects.toBeTruthy();
    const del = mountWith(() => useDeleteNote());
    await del.mutateAsync({ id: "n22", documentId: "book-1" });
    expect(fake.rows("scriptorium_notes").find((n) => n.id === "n22")).toMatchObject({ body: "n22" });
  });

  it("deletes my note", async () => {
    const api = mountWith(() => useDeleteNote());
    await api.mutateAsync({ id: "n1", documentId: "book-1" });
    expect(fake.rows("scriptorium_notes").map((n) => n.id)).not.toContain("n1");
  });
});
