/**
 * Hands `blob` to the browser as a download named `filename`.
 *
 * The anchor is appended before clicking and the object URL is revoked on a
 * later task, never on the next line. `a.click()` only *queues* the download:
 * revoking in the same tick invalidates the blob before the browser has read
 * it, which in Safari and some Firefox versions yields a zero-byte file or no
 * file at all, while this function returns normally and the caller reports
 * success. Every file the app hands over goes through here so that cannot be
 * written again one call site at a time.
 */
export function downloadBlob(blob: Blob, filename: string): void {
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
