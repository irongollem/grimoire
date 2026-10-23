import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  deleteByPublicUrl: vi.fn(),
  report: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mocks.from, rpc: vi.fn() } }));
vi.mock("@/lib/storage/remove", () => ({ deleteByPublicUrl: mocks.deleteByPublicUrl }));
vi.mock("@/lib/observability/sentry", () => ({ reportHandledError: mocks.report }));

import {
  RELEASE_LIST_COLUMNS,
  openBookPreviewKey,
  openBookReleasesKey,
  releaseSnapshotKey,
  useDeleteRelease,
  useSetReleasePdf,
} from "./useOpenBookReleases";
import { openBookKey } from "./useOpenBook";

function run<T>(use: () => T) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  let result!: T;
  const Host = defineComponent({
    setup() {
      result = use();
      return () => null;
    },
  });
  mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } });
  return { client, result: () => result };
}

describe("open book query keys", () => {
  it("start with their registry roots", () => {
    expect(openBookKey("c")[0]).toBe("open-book");
    expect(openBookReleasesKey("c")[0]).toBe("open-book-releases");
    expect(releaseSnapshotKey("r")[0]).toBe("open-book-releases");
    expect(openBookPreviewKey("c")[0]).toBe("open-book");
  });
  it("keeps a snapshot out of the list's own key", () => {
    expect(releaseSnapshotKey("r")).not.toEqual(openBookReleasesKey("r"));
  });
});

describe("RELEASE_LIST_COLUMNS", () => {
  it("never reads the snapshot", () => {
    expect(RELEASE_LIST_COLUMNS).not.toMatch(/snapshot/);
    expect(RELEASE_LIST_COLUMNS).toMatch(/\bstats\b/);
  });
});

describe("release PDFs", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    // update(...).eq().eq().select() and delete().eq().eq().select() end on `select`.
    const chain = { eq: mocks.eq, select: mocks.select };
    mocks.eq.mockReturnValue(chain);
    mocks.from.mockReturnValue({ update: mocks.update, delete: mocks.del });
    mocks.update.mockReturnValue(chain);
    mocks.del.mockReturnValue(chain);
  });

  const vars = { campaignId: "c", releaseId: "r", pdfUrl: "https://cdn/open-book-pdfs/u/c/r-new.pdf" };

  it("writes the new address, then removes the file it replaces", async () => {
    mocks.select.mockResolvedValue({ data: [{ id: "r" }], error: null });
    const { result } = run(() => useSetReleasePdf());
    await result().mutateAsync({ ...vars, previousUrl: "https://cdn/open-book-pdfs/u/c/r-old.pdf" });
    expect(mocks.update).toHaveBeenCalledWith({ pdf_url: vars.pdfUrl });
    expect(mocks.deleteByPublicUrl).toHaveBeenCalledWith("https://cdn/open-book-pdfs/u/c/r-old.pdf");
    expect(mocks.update.mock.invocationCallOrder[0]).toBeLessThan(mocks.deleteByPublicUrl.mock.invocationCallOrder[0]);
  });

  it("removes nothing the first time, and keeps the old file when the row did not change", async () => {
    mocks.select.mockResolvedValue({ data: [{ id: "r" }], error: null });
    const first = run(() => useSetReleasePdf());
    await first.result().mutateAsync({ ...vars, previousUrl: null });
    expect(mocks.deleteByPublicUrl).not.toHaveBeenCalled();

    mocks.select.mockResolvedValue({ data: [], error: null });
    const gone = run(() => useSetReleasePdf());
    await expect(gone.result().mutateAsync({ ...vars, previousUrl: "https://cdn/old.pdf" })).rejects.toThrow(/no longer in the book/);
    expect(mocks.deleteByPublicUrl).not.toHaveBeenCalled();
  });

  it("throws the update error and removes nothing", async () => {
    mocks.select.mockResolvedValue({ data: null, error: new Error("denied") });
    const { result } = run(() => useSetReleasePdf());
    await expect(result().mutateAsync({ ...vars, previousUrl: "https://cdn/old.pdf" })).rejects.toThrow("denied");
    expect(mocks.deleteByPublicUrl).not.toHaveBeenCalled();
  });

  it("removes a deleted release's PDF once the row is gone", async () => {
    mocks.select.mockResolvedValue({ data: [{ id: "r", pdf_url: "https://cdn/open-book-pdfs/u/c/r-x.pdf" }], error: null });
    const { result } = run(() => useDeleteRelease());
    await result().mutateAsync({ campaignId: "c", releaseId: "r" });
    expect(mocks.select).toHaveBeenCalledWith("id, pdf_url");
    expect(mocks.deleteByPublicUrl).toHaveBeenCalledWith("https://cdn/open-book-pdfs/u/c/r-x.pdf");
  });

  it("keeps the PDF of a release the database refused to delete", async () => {
    mocks.select.mockResolvedValue({ data: [], error: null });
    const { result } = run(() => useDeleteRelease());
    await expect(result().mutateAsync({ campaignId: "c", releaseId: "r" })).rejects.toThrow(/live release/);
    expect(mocks.deleteByPublicUrl).not.toHaveBeenCalled();
  });

  it("does not fail the delete when the file cannot be removed", async () => {
    mocks.select.mockResolvedValue({ data: [{ id: "r", pdf_url: "https://cdn/x.pdf" }], error: null });
    mocks.deleteByPublicUrl.mockRejectedValue(new Error("storage down"));
    const { result } = run(() => useDeleteRelease());
    await result().mutateAsync({ campaignId: "c", releaseId: "r" });
    await flushPromises();
    expect(mocks.report).toHaveBeenCalled();
  });
});
