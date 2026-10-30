import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { isQuotaExceeded } from "@/lib/quotaError";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({
  supabase: fake.client,
  getCurrentUser: () => ({ id: "user-1" }),
}));

import {
  useScriptoriumDocuments,
  useCreateScriptoriumBook,
  useUpdateScriptoriumDocument,
  useDeleteScriptoriumDocument,
  useScriptoriumDocument,
  useShareHandout,
  previewHandoutShare,
} from "./useScriptorium";
import type { ScriptoriumDocInsert, ScriptoriumDocUpdate } from "@/types/scriptorium.types";

function withQuery<T>(setupFn: () => T): T {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let api!: T;
  mount(
    defineComponent({
      setup() {
        api = setupFn();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient }]] } },
  );
  return api;
}

const baseDoc: ScriptoriumDocInsert = {
  title: "Test Doc",
  kind: "book",
  doc_type: "custom",
  campaign_id: null,
  tags: [],
  is_published: false,
  is_two_column: false,
  theme: "onednd2024",
  page_size: "A4",
  ink_friendly: false,
  show_page_numbers: false,
  footer_text: "",
  page_number_start: 1,
};

beforeEach(() => fake.reset());

describe("useScriptoriumDocuments", () => {
  // Since #970 a player may also SELECT a handout shared with them, so RLS alone would mix
  // another account's documents into a DM's own Scriptorium: the read must scope to the owner itself.
  it("lists only the signed-in user's own documents, newest first, without their bodies", async () => {
    fake.seed("scriptorium_documents", [
      { id: "old", user_id: "user-1", title: "Old", updated_at: "2026-01-01" },
      { id: "new", user_id: "user-1", title: "New", updated_at: "2026-02-01" },
      { id: "shared-with-me", user_id: "another-dm", title: "Handout", updated_at: "2026-03-01" },
    ]);
    const { data } = withQuery(() => useScriptoriumDocuments());
    await flushPromises();
    expect(data.value?.map((d) => d.id)).toEqual(["new", "old"]);
    // Selecting `*` once shipped every document's full Tiptap body just to draw its card.
    const columns = (fake.calls[0]?.columns ?? "").split(/,\s*/);
    expect(columns).not.toContain("*");
    expect(columns).not.toContain("content");
  });
});

describe("useScriptoriumDocument", () => {
  it("opens the user's own document, and does not open another account's by id", async () => {
    fake.seed("scriptorium_documents", [
      { id: "mine", user_id: "user-1", title: "Mine" },
      { id: "theirs", user_id: "another-dm", title: "Theirs" },
    ]);
    const mine = withQuery(() => useScriptoriumDocument(ref("mine")));
    const theirs = withQuery(() => useScriptoriumDocument(ref("theirs")));
    await flushPromises();
    expect(mine.data.value?.title).toBe("Mine");
    expect(theirs.data.value).toBeUndefined();
    expect(theirs.isError.value).toBe(true);
  });
});

describe("useCreateScriptoriumBook", () => {
  // The fake mints no ids, so the book is given one the way the database would.
  const book = { ...baseDoc, id: "b1" } as ScriptoriumDocInsert;

  it("inserts the book for the current user with one empty chapter, titled and counted from its content", async () => {
    const { mutateAsync } = withQuery(() => useCreateScriptoriumBook());
    const created = await mutateAsync({ book });
    expect(created).toMatchObject({ title: "Test Doc", user_id: "user-1" });
    const chapters = fake.rows("scriptorium_chapters");
    expect(chapters).toHaveLength(1);
    expect(chapters[0]).toMatchObject({ document_id: "b1", position: 0, title: "", word_count: 0 });
  });

  it("writes the given chapters in order with title and word count from each body", async () => {
    const heading = (t: string) => ({ type: "heading", content: [{ type: "text", text: t }] });
    const { mutateAsync } = withQuery(() => useCreateScriptoriumBook());
    await mutateAsync({
      book,
      chapters: [
        { content: { type: "doc", content: [heading("One"), { type: "paragraph", content: [{ type: "text", text: "a b" }] }] } },
        { content: { type: "doc", content: [heading("Two")] } },
      ],
    });
    expect(fake.rows("scriptorium_chapters").map((c) => [c.position, c.title, c.word_count])).toEqual([
      [0, "One", 3],
      [1, "Two", 1],
    ]);
  });

  it("removes the just-created book when its chapters fail to insert, so no empty orphan is left", async () => {
    fake.failNext("scriptorium_chapters", { message: "chapters down" });
    const { mutateAsync } = withQuery(() => useCreateScriptoriumBook());
    await expect(mutateAsync({ book })).rejects.toMatchObject({ message: "chapters down" });
    expect(fake.rows("scriptorium_documents")).toEqual([]);
  });

  it("propagates a quota-exceeded error from the enforce_quota trigger", async () => {
    fake.failNext("scriptorium_documents", { message: "quota_exceeded" });
    const { mutateAsync } = withQuery(() => useCreateScriptoriumBook());
    await expect(mutateAsync({ book })).rejects.toSatisfy((err: unknown) => isQuotaExceeded(err));
    expect(fake.rows("scriptorium_chapters")).toEqual([]);
  });
});

describe("useUpdateScriptoriumDocument", () => {
  it("updates the given document only", async () => {
    fake.seed("scriptorium_documents", [
      { id: "d1", user_id: "user-1", title: "Old" },
      { id: "d2", user_id: "user-1", title: "Other" },
    ]);
    const update: ScriptoriumDocUpdate = { title: "Renamed" };
    const { mutateAsync } = withQuery(() => useUpdateScriptoriumDocument());
    const result = await mutateAsync({ id: "d1", update });
    expect(result.title).toBe("Renamed");
    expect(fake.rows("scriptorium_documents").map((d) => d.title)).toEqual(["Renamed", "Other"]);
  });
});

describe("useDeleteScriptoriumDocument", () => {
  it("deletes the named document only", async () => {
    fake.seed("scriptorium_documents", [{ id: "d1" }, { id: "d2" }]);
    const { mutateAsync } = withQuery(() => useDeleteScriptoriumDocument());
    await mutateAsync("d1");
    expect(fake.rows("scriptorium_documents").map((d) => d.id)).toEqual(["d2"]);
  });

  it("throws on a delete error", async () => {
    fake.failNext("scriptorium_documents", { message: "boom" });
    const { mutateAsync } = withQuery(() => useDeleteScriptoriumDocument());
    await expect(mutateAsync("d1")).rejects.toMatchObject({ message: "boom" });
  });
});

describe("handout sharing", () => {
  const result = { revealed: [], recipients: ["pm1"] };
  const shareArgs = () => fake.calls.filter((c) => c.kind === "rpc").map((c) => c.payload as Record<string, unknown>);

  it("previews with a dry run that writes nothing, and shares for real through the mutation", async () => {
    fake.onRpc("share_handout", () => result);
    await previewHandoutShare("d1", ["pm1"]);
    const { mutateAsync } = withQuery(() => useShareHandout());
    await mutateAsync({ id: "d1", partyMemberIds: ["pm1"] });
    expect(shareArgs().map((a) => a.p_dry_run)).toEqual([true, false]);
    expect(shareArgs().every((a) => a.p_document_id === "d1")).toBe(true);
  });

  it("throws a refused share instead of reporting it done", async () => {
    fake.failNext("share_handout", { message: "Not authorized" });
    await expect(previewHandoutShare("d1", [])).rejects.toMatchObject({ message: "Not authorized" });
  });
});
