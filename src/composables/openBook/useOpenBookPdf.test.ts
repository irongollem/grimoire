import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import type { OpenBookRelease, OpenBookSnapshot } from "@/types/openBook.types";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  user: { id: "u-1" } as { id: string } | null,
  upload: vi.fn(),
  download: vi.fn(),
  fetchSnapshot: vi.fn(),
  setPdf: vi.fn(),
  build: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({ supabase: { functions: { invoke: mocks.invoke } }, getCurrentUser: () => mocks.user }));
vi.mock("@/lib/storage/upload", () => ({ uploadToBucket: mocks.upload }));
vi.mock("@/lib/storage/remove", () => ({ deleteByPublicUrl: mocks.remove }));
vi.mock("@/lib/downloadBlob", () => ({ downloadBlob: mocks.download }));
vi.mock("@/lib/openBook/pdf/buildBookPdfHtml", () => ({ buildBookPdfHtml: mocks.build }));
vi.mock("./useOpenBookReleases", () => ({
  fetchReleaseSnapshot: mocks.fetchSnapshot,
  releaseSnapshotKey: (id: string) => ["open-book-releases", "snapshot", id],
  useSetReleasePdf: () => ({ mutateAsync: mocks.setPdf }),
}));

import { PDF_PHASE_LABEL, useOpenBookPdf } from "./useOpenBookPdf";

const snapshot = { book: { title: "The Saltreach" } } as OpenBookSnapshot;
const release = { id: "r-1", number: 2, created_at: "2026-10-23T10:00:00Z", note: null, pdf_url: "https://cdn/old.pdf" } as OpenBookRelease;

function run() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let result!: ReturnType<typeof useOpenBookPdf>;
  const Host = defineComponent({
    setup() {
      result = useOpenBookPdf(() => "c-1");
      return () => null;
    },
  });
  mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient: client }]] } });
  return result;
}

describe("useOpenBookPdf", () => {
  beforeEach(() => {
    for (const mock of [mocks.invoke, mocks.upload, mocks.download, mocks.fetchSnapshot, mocks.setPdf, mocks.build, mocks.remove]) mock.mockReset();
    mocks.remove.mockResolvedValue(undefined);
    mocks.user = { id: "u-1" };
    mocks.fetchSnapshot.mockResolvedValue(snapshot);
    mocks.build.mockResolvedValue({ html: "<!doctype html>", pageCount: 3 });
    mocks.invoke.mockResolvedValue({ data: new Blob(["%PDF"], { type: "application/pdf" }), error: null });
    mocks.upload.mockResolvedValue("https://cdn/open-book-pdfs/u-1/c-1/r-1-new.pdf");
    mocks.setPdf.mockResolvedValue(undefined);
  });

  it("lays out, prints, stores, records the address and hands the owner the file", async () => {
    const pdf = run();
    expect(await pdf.exportRelease({ slug: "saltreach" }, release)).toBe(true);

    expect(mocks.build).toHaveBeenCalledWith(expect.objectContaining({ snapshot, slug: "saltreach", release }));
    expect(mocks.invoke).toHaveBeenCalledWith("render-pdf", { body: { html: "<!doctype html>" } });
    const upload = mocks.upload.mock.calls[0][0];
    expect(upload.bucket).toBe("openBookPdfs");
    expect(upload.contentType).toBe("application/pdf");
    expect(upload.path).toMatch(/^u-1\/c-1\/r-1-[0-9a-f-]+\.pdf$/);
    expect(mocks.setPdf).toHaveBeenCalledWith({
      campaignId: "c-1",
      releaseId: "r-1",
      pdfUrl: "https://cdn/open-book-pdfs/u-1/c-1/r-1-new.pdf",
      previousUrl: "https://cdn/old.pdf",
    });
    expect(mocks.download).toHaveBeenCalledWith(expect.any(Blob), "The Saltreach (release 2).pdf");
    expect(pdf.error.value).toBe("");
    expect(pdf.releaseId.value).toBeNull();
    expect(pdf.phase.value).toBeNull();
  });

  it("reports each phase in order", async () => {
    const seen: (string | null)[] = [];
    const pdf = run();
    mocks.build.mockImplementation(async () => {
      seen.push(pdf.phase.value);
      return { html: "<!doctype html>", pageCount: 1 };
    });
    mocks.invoke.mockImplementation(async () => {
      seen.push(pdf.phase.value);
      return { data: new Blob(["%PDF"]), error: null };
    });
    mocks.upload.mockImplementation(async () => {
      seen.push(pdf.phase.value);
      return "https://cdn/x.pdf";
    });
    await pdf.exportRelease({ slug: "s" }, release);
    expect(seen).toEqual(["layout", "print", "upload"]);
    expect(Object.keys(PDF_PHASE_LABEL)).toEqual(["layout", "print", "upload"]);
  });

  it("shows the renderer's refusal and stores nothing", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { message: "PDF export is not set up", context: new Response(JSON.stringify({ error: "PDF export is not set up on this server yet." }), { status: 503 }) } });
    const pdf = run();
    expect(await pdf.exportRelease({ slug: "s" }, release)).toBe(false);
    expect(pdf.error.value).toBe("PDF export is not set up on this server yet.");
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(pdf.releaseId.value).toBeNull();
  });

  it("does not record an address when the upload fails", async () => {
    mocks.upload.mockResolvedValue(null);
    const pdf = run();
    expect(await pdf.exportRelease({ slug: "s" }, release)).toBe(false);
    expect(pdf.error.value).toMatch(/could not be stored/);
    expect(mocks.setPdf).not.toHaveBeenCalled();
  });

  it("removes the new file when the release cannot record it", async () => {
    mocks.setPdf.mockRejectedValue(new Error("That release is no longer in the book."));
    const pdf = run();
    expect(await pdf.exportRelease({ slug: "s" }, release)).toBe(false);
    expect(mocks.remove).toHaveBeenCalledWith("https://cdn/open-book-pdfs/u-1/c-1/r-1-new.pdf");
    expect(pdf.error.value).toMatch(/no longer in the book/);
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it("explains a file the bucket refuses, such as one over 50 MB", async () => {
    mocks.upload.mockRejectedValue(new Error("open-book-pdfs: file is 61.0 MB, max 50 MB"));
    const pdf = run();
    expect(await pdf.exportRelease({ slug: "s" }, release)).toBe(false);
    expect(pdf.error.value).toBe("open-book-pdfs: file is 61.0 MB, max 50 MB");
  });

  it("asks the owner to sign in again rather than upload as nobody", async () => {
    mocks.user = null;
    const pdf = run();
    expect(await pdf.exportRelease({ slug: "s" }, release)).toBe(false);
    expect(pdf.error.value).toMatch(/Sign in again/);
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it("takes one export at a time", async () => {
    let finish!: () => void;
    mocks.build.mockImplementation(() => new Promise((resolve) => { finish = () => resolve({ html: "<!doctype html>", pageCount: 1 }); }));
    const pdf = run();
    const first = pdf.exportRelease({ slug: "s" }, release);
    await flushPromises();
    expect(pdf.releaseId.value).toBe("r-1");
    expect(await pdf.exportRelease({ slug: "s" }, release)).toBe(false);
    finish();
    expect(await first).toBe(true);
  });
});
