import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { functionErrorCode } from "@/lib/functionError";

/** `export-my-data` edge function error codes (#632) -> human copy. */
const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: "You've requested this a few times just now. Try again in an hour.",
  export_failed: "Your export could not be built. Please try again or contact support.",
  Unauthorized: "Your session has expired. Sign in again to download your data.",
};

/** Maps an `export-my-data` error code to human copy; an unrecognised code passes through verbatim. */
export function dataExportErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? code;
}

/** `grimoire-my-data-2026-08-11.json` — dated, because a user may keep several. */
export function exportFilename(now: Date): string {
  const [date] = now.toISOString().split("T");
  return `grimoire-my-data-${date}.json`;
}

/**
 * Triggers a browser download of `contents` as `filename`. Split out from the
 * request so the composable's tests can assert what would be downloaded without
 * a DOM that implements object URLs (jsdom has no `createObjectURL`).
 *
 * The anchor is appended before clicking and the URL is revoked on a later
 * task, not on the next line. `a.click()` only *queues* the download; revoking
 * the object URL in the same tick invalidates the blob before the browser has
 * read it, which for a multi-megabyte export yields a zero-byte file or nothing
 * at all — while this function returns normally and the caller reports success.
 * An account export is exactly the size where that bites.
 */
export function downloadJson(contents: string, filename: string): void {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, REVOKE_DELAY_MS);
}

/** Long enough for the browser to have started reading the blob; short enough not to leak. */
const REVOKE_DELAY_MS = 60_000;

/**
 * GDPR access & portability export (#632). Asks `export-my-data` for everything
 * the account holds and hands it to the user as one JSON file.
 *
 * The whole document is built server-side — the client neither says whose data
 * it wants (the edge function reads that from the JWT) nor assembles it from
 * per-table queries, which is what keeps the export honest: a client-side
 * assembly would only ever cover the tables the client already knows how to
 * read, and would silently omit the rest.
 */
export function useDataExport() {
  const exporting = ref(false);
  const error = ref<string | null>(null);

  async function exportData(): Promise<boolean> {
    exporting.value = true;
    error.value = null;
    try {
      const { data, error: fnError } = await supabase.functions.invoke("export-my-data", { body: {} });
      if (fnError) throw new Error(await functionErrorCode(fnError));
      if (data?.error) throw new Error(data.error);

      downloadJson(JSON.stringify(data, null, 2), exportFilename(new Date()));
      return true;
    } catch (err) {
      error.value = dataExportErrorMessage(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      exporting.value = false;
    }
  }

  return { exporting, error, exportData };
}
