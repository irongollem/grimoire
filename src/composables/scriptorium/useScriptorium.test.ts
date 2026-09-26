import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { isQuotaExceeded } from "@/lib/quotaError";

// Minimal chainable Supabase mock covering exactly what useScriptorium.ts
// calls: .from(table).select()[.order()|.eq().single()], .insert().select().single(),
// .update().eq().select().single(), .delete().eq().
const mocks = vi.hoisted(() => ({
  insertResult: { data: null as unknown, error: null as unknown },
  updateResult: { data: null as unknown, error: null as unknown },
  deleteResult: { error: null as unknown },
  listResult: { data: [] as unknown[], error: null as unknown },
  getResult: { data: null as unknown, error: null as unknown },
  lastInsertPayload: null as unknown,
  lastUpdatePayload: null as unknown,
  lastDeleteId: null as unknown,
}));

function makeBuilder() {
  // Each `.from()` call gets its own builder, so this mode is scoped to one
  // request chain — no cross-test bleed between insert/update/get/delete
  // results. `delete()` has no `.single()` after it (unlike get/insert/
  // update) — real supabase-js query builders are themselves thenable, so
  // `.eq()` has to be the terminal, promise-returning call for a delete.
  let mode: "get" | "insert" | "update" | "delete" = "get";
  const builder = {
    select: () => builder,
    order: () => Promise.resolve(mocks.listResult),
    eq: (_col: string, val: string) => {
      mocks.lastDeleteId = val;
      if (mode === "delete") return Promise.resolve(mocks.deleteResult);
      return builder;
    },
    single: () =>
      Promise.resolve(
        mode === "insert" ? mocks.insertResult : mode === "update" ? mocks.updateResult : mocks.getResult,
      ),
    insert: (payload: unknown) => {
      mode = "insert";
      mocks.lastInsertPayload = payload;
      return builder;
    },
    update: (payload: unknown) => {
      mode = "update";
      mocks.lastUpdatePayload = payload;
      return builder;
    },
    delete: () => {
      mode = "delete";
      return builder;
    },
  };
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => makeBuilder() },
  getCurrentUser: () => ({ id: "user-1" }),
}));

import {
  useScriptoriumDocuments,
  useCreateScriptoriumDocument,
  useUpdateScriptoriumDocument,
  useDeleteScriptoriumDocument,
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
  content: null,
  doc_type: "custom",
  campaign_id: null,
  tags: [],
  is_published: false,
  is_two_column: false,
  theme: "onednd2024",
  page_size: "A4",
  ink_friendly: false,
  word_count: 0,
  show_page_numbers: false,
  footer_text: "",
  page_number_start: 1,
};

describe("useScriptoriumDocuments", () => {
  it("lists documents via the summary columns query", async () => {
    mocks.listResult = { data: [{ id: "d1", title: "A" }], error: null };
    const { data } = withQuery(() => useScriptoriumDocuments());
    await flushPromises();
    expect(data.value).toEqual([{ id: "d1", title: "A" }]);
  });
});

describe("useCreateScriptoriumDocument", () => {
  it("inserts with the current user's id and returns the created row", async () => {
    mocks.insertResult = { data: { id: "new-1", ...baseDoc }, error: null };
    const { mutateAsync } = withQuery(() => useCreateScriptoriumDocument());
    const created = await mutateAsync(baseDoc);
    expect(created).toEqual({ id: "new-1", ...baseDoc });
    expect(mocks.lastInsertPayload).toMatchObject({ ...baseDoc, user_id: "user-1" });
  });

  it("propagates a quota-exceeded error from the enforce_quota trigger", async () => {
    mocks.insertResult = { data: null, error: { message: "quota_exceeded" } };
    const { mutateAsync } = withQuery(() => useCreateScriptoriumDocument());
    await expect(mutateAsync(baseDoc)).rejects.toSatisfy((err: unknown) => isQuotaExceeded(err));
  });

  it("propagates an ordinary error without treating it as a quota error", async () => {
    mocks.insertResult = { data: null, error: { message: "network error" } };
    const { mutateAsync } = withQuery(() => useCreateScriptoriumDocument());
    let caught: unknown;
    try {
      await mutateAsync(baseDoc);
    } catch (e) {
      caught = e;
    }
    expect(isQuotaExceeded(caught)).toBe(false);
  });
});

describe("useUpdateScriptoriumDocument", () => {
  it("updates the given id with the update payload", async () => {
    const update: ScriptoriumDocUpdate = { title: "Renamed" };
    mocks.updateResult = { data: { id: "d1", ...baseDoc, title: "Renamed" }, error: null };
    const { mutateAsync } = withQuery(() => useUpdateScriptoriumDocument());
    const result = await mutateAsync({ id: "d1", update });
    expect(result.title).toBe("Renamed");
    expect(mocks.lastUpdatePayload).toEqual(update);
  });
});

describe("useDeleteScriptoriumDocument", () => {
  it("deletes the document by id", async () => {
    mocks.deleteResult = { error: null };
    const { mutateAsync } = withQuery(() => useDeleteScriptoriumDocument());
    await mutateAsync("d1");
    expect(mocks.lastDeleteId).toBe("d1");
  });

  it("throws on a delete error", async () => {
    mocks.deleteResult = { error: { message: "boom" } };
    const { mutateAsync } = withQuery(() => useDeleteScriptoriumDocument());
    await expect(mutateAsync("d1")).rejects.toBeTruthy();
  });
});
