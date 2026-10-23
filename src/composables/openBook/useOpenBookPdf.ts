/**
 * Exports a release of the Open Book as a PDF (#1085): the book laid out in the browser and printed by the
 * `render-pdf` edge function (the same pipeline as Scriptorium's), then stored in the `open-book-pdfs` bucket and
 * recorded on the release row, where the public reader's "Download PDF" finds it. The owner gets the file too.
 *
 * The layout code is a dynamic import: it pulls in Paged.js and the reader's article components, which a settings
 * page that never exports should not pay for.
 */

import { ref } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import { edgeErrorMessage } from "@edge-shared/edgeError.ts";
import { supabase, getCurrentUser } from "@/lib/supabase";
import { downloadBlob } from "@/lib/downloadBlob";
import { uploadToBucket } from "@/lib/storage/upload";
import { bookPdfFilename, bookPdfPath } from "@/lib/openBook/pdf/bookDocument";
import type { OpenBook, OpenBookRelease } from "@/types/openBook.types";
import { fetchReleaseSnapshot, releaseSnapshotKey, useSetReleasePdf } from "./useOpenBookReleases";

export type PdfPhase = "layout" | "print" | "upload";

export const PDF_PHASE_LABEL: Record<PdfPhase, string> = {
  layout: "Laying out pages…",
  print: "Printing…",
  upload: "Uploading…",
};

export function useOpenBookPdf(campaignId: () => string) {
  const queryClient = useQueryClient();
  const setPdf = useSetReleasePdf();

  /** The release being exported, so only its row shows progress. */
  const releaseId = ref<string | null>(null);
  const phase = ref<PdfPhase | null>(null);
  const error = ref("");

  /** Resolves true when the PDF is stored, recorded and downloaded; false when it failed (`error` says why). */
  async function exportRelease(book: Pick<OpenBook, "slug">, release: OpenBookRelease): Promise<boolean> {
    if (releaseId.value !== null) return false;
    releaseId.value = release.id;
    error.value = "";
    try {
      const cid = campaignId();
      const user = getCurrentUser();
      if (!user) throw new Error("Sign in again to export the PDF.");

      phase.value = "layout";
      const snapshot = await queryClient.fetchQuery({
        queryKey: releaseSnapshotKey(release.id),
        queryFn: () => fetchReleaseSnapshot(cid, release.id),
        staleTime: Number.POSITIVE_INFINITY,
      });
      const { buildBookPdfHtml } = await import("@/lib/openBook/pdf/buildBookPdfHtml");
      const { html } = await buildBookPdfHtml({
        snapshot,
        release,
        slug: book.slug,
        origin: window.location.origin,
      });

      phase.value = "print";
      const { data, error: fnError } = await supabase.functions.invoke("render-pdf", { body: { html } });
      if (fnError) throw new Error(await edgeErrorMessage(fnError));
      if (!(data instanceof Blob)) throw new Error("The PDF renderer returned an unexpected answer.");
      const pdf = new Blob([data], { type: "application/pdf" });

      phase.value = "upload";
      const url = await uploadToBucket({
        bucket: "openBookPdfs",
        blob: pdf,
        path: bookPdfPath(user.id, cid, release.id, crypto.randomUUID()),
        contentType: "application/pdf",
      });
      if (!url) throw new Error("The PDF could not be stored. Please try again.");
      await setPdf.mutateAsync({ campaignId: cid, releaseId: release.id, pdfUrl: url, previousUrl: release.pdf_url });

      downloadBlob(pdf, bookPdfFilename(snapshot.book.title, release.number));
      return true;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "The PDF could not be made.";
      return false;
    } finally {
      phase.value = null;
      releaseId.value = null;
    }
  }

  return { releaseId, phase, error, exportRelease };
}
