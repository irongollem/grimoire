import { ref } from "vue";
import { supabase } from "@/lib/supabase";
import { functionErrorCode } from "@edge-shared/functionError.ts";
import { downloadBlob } from "@/lib/downloadBlob";

/** `export-my-data` edge function error codes (#632, #919) -> human copy. */
const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: "You've requested this a few times just now. Try again in an hour.",
  export_failed: "Your export could not be built. Please try again or contact support.",
  Unauthorized: "Your session has expired. Sign in again to download your data.",
  not_your_child: "You can only download data for a child account you actively parent.",
};

/** Maps an `export-my-data` error code to human copy; an unrecognised code passes through verbatim. */
export function dataExportErrorMessage(code: string): string {
  return ERROR_MESSAGES[code] ?? code;
}

/**
 * `grimoire-my-data-2026-08-11.json` — dated, because a user may keep several.
 *
 * `label` distinguishes a parent's download of a child's account (#919) — pass
 * the child's login name, e.g. `grimoire-bramka-data-2026-08-11.json`. Left
 * out, the filename is exactly what it always was.
 */
export function exportFilename(now: Date, label?: string): string {
  const [date] = now.toISOString().split("T");
  const subject = label ? sanitizeFilenameLabel(label) : "";
  return `grimoire-${subject || "my"}-data-${date}.json`;
}

/** Lowercases and strips anything that isn't filename-safe, for use in `exportFilename`. */
function sanitizeFilenameLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Triggers a browser download of `contents` as `filename`. Split out from the
 * request so the composable's tests can assert what would be downloaded without
 * a DOM that implements object URLs (jsdom has no `createObjectURL`).
 */
export function downloadJson(contents: string, filename: string): void {
  downloadBlob(new Blob([contents], { type: "application/json" }), filename);
}

/**
 * GDPR access & portability export (#632). Asks `export-my-data` for everything
 * the account holds and hands it to the user as one JSON file.
 *
 * The whole document is built server-side — the client neither says whose data
 * it wants beyond `targetUserId` (identity comes from the JWT; the edge
 * function re-verifies any target is actually the caller's own child) nor
 * assembles it from per-table queries, which is what keeps the export honest:
 * a client-side assembly would only ever cover the tables the client already
 * knows how to read, and would silently omit the rest.
 *
 * `targetUserId` omitted exports the caller's own account, exactly as before
 * (#632). Passed, and different from the caller, it asks for a child account
 * the caller parents (#919) — `label` (e.g. the child's login name) is passed
 * through to `exportFilename` so the download is distinguishable from the
 * parent's own.
 */
export function useDataExport() {
  const exporting = ref(false);
  const error = ref<string | null>(null);

  async function exportData(targetUserId?: string, label?: string): Promise<boolean> {
    exporting.value = true;
    error.value = null;
    try {
      const body: { targetUserId?: string } = {};
      if (targetUserId) body.targetUserId = targetUserId;

      const { data, error: fnError } = await supabase.functions.invoke("export-my-data", { body });
      if (fnError) throw new Error(await functionErrorCode(fnError));
      if (data?.error) throw new Error(data.error);

      downloadJson(JSON.stringify(data, null, 2), exportFilename(new Date(), label));
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
