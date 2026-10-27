import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const mocks = vi.hoisted(() => ({
  deleteByPublicUrl: vi.fn(),
  report: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
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

// The doorbell invalidates by root, so a key under the wrong root never refreshes.
describe("open book query keys", () => {
  it("start with their registry roots, and a snapshot stays out of the list's own key", () => {
    expect(openBookKey("c")[0]).toBe("open-book");
    expect(openBookReleasesKey("c")[0]).toBe("open-book-releases");
    expect(releaseSnapshotKey("r")[0]).toBe("open-book-releases");
    expect(openBookPreviewKey("c")[0]).toBe("open-book");
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
  const OLD = "https://cdn/open-book-pdfs/u/c/r-old.pdf";
  const NEW = "https://cdn/open-book-pdfs/u/c/r-new.pdf";

  beforeEach(() => {
    fake.reset();
    for (const mock of Object.values(mocks)) mock.mockReset();
    fake.seed("open_book_releases", [
      { id: "r", campaign_id: "c", pdf_url: OLD },
      { id: "r", campaign_id: "other", pdf_url: "https://cdn/theirs.pdf" },
    ]);
  });

  const vars = { campaignId: "c", releaseId: "r", pdfUrl: NEW };
  const pdfOf = (campaign: string) => fake.rows("open_book_releases").find((r) => r.campaign_id === campaign)?.pdf_url;

  it("points the release at the new file before removing the one it replaces", async () => {
    // A reader following the link must never land on a deleted file.
    let addressWhenRemoved: unknown;
    mocks.deleteByPublicUrl.mockImplementation(async () => { addressWhenRemoved = pdfOf("c"); });
    const { result } = run(() => useSetReleasePdf());
    await result().mutateAsync({ ...vars, previousUrl: OLD });
    expect(addressWhenRemoved).toBe(NEW);
    expect(mocks.deleteByPublicUrl).toHaveBeenCalledWith(OLD);
    expect(pdfOf("other")).toBe("https://cdn/theirs.pdf");
  });

  it("removes nothing the first time, or when the new file is the one already recorded", async () => {
    const first = run(() => useSetReleasePdf());
    await first.result().mutateAsync({ ...vars, previousUrl: null });
    await first.result().mutateAsync({ ...vars, previousUrl: NEW });
    expect(mocks.deleteByPublicUrl).not.toHaveBeenCalled();
  });

  it("keeps the old file and says so when the release is no longer in the book", async () => {
    const { result } = run(() => useSetReleasePdf());
    await expect(
      result().mutateAsync({ ...vars, releaseId: "gone", previousUrl: OLD }),
    ).rejects.toThrow(/no longer in the book/);
    expect(mocks.deleteByPublicUrl).not.toHaveBeenCalled();
  });

  it("throws the update error and removes nothing", async () => {
    fake.failNext("open_book_releases", { message: "denied" });
    const { result } = run(() => useSetReleasePdf());
    await expect(result().mutateAsync({ ...vars, previousUrl: OLD })).rejects.toMatchObject({ message: "denied" });
    expect(mocks.deleteByPublicUrl).not.toHaveBeenCalled();
    expect(pdfOf("c")).toBe(OLD);
  });

  it("removes a deleted release's PDF once the row is gone, and only that campaign's row goes", async () => {
    const { result } = run(() => useDeleteRelease());
    await result().mutateAsync({ campaignId: "c", releaseId: "r" });
    expect(mocks.deleteByPublicUrl).toHaveBeenCalledWith(OLD);
    expect(fake.rows("open_book_releases").map((r) => r.campaign_id)).toEqual(["other"]);
  });

  it("keeps the PDF of a release the database refused to delete", async () => {
    // RLS refuses the live release silently: nothing matches, nothing is returned.
    const { result } = run(() => useDeleteRelease());
    await expect(result().mutateAsync({ campaignId: "c", releaseId: "live" })).rejects.toThrow(/live release/);
    expect(mocks.deleteByPublicUrl).not.toHaveBeenCalled();
  });

  it("does not fail the delete when the file cannot be removed, but reports it", async () => {
    mocks.deleteByPublicUrl.mockRejectedValue(new Error("storage down"));
    const { result } = run(() => useDeleteRelease());
    await result().mutateAsync({ campaignId: "c", releaseId: "r" });
    await flushPromises();
    expect(mocks.report).toHaveBeenCalled();
    expect(pdfOf("c")).toBeUndefined();
  });
});
