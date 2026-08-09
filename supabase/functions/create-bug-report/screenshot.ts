/**
 * Screenshot validation for the in-app bug reporter.
 *
 * Pure — no Deno or network imports — so it is unit-tested by vitest alongside
 * `_shared/credit-math.ts` and friends, rather than only exercised in
 * production. It is the whole gate between a caller and an arbitrary string
 * stored on `bug_reports.screenshot` and later bound into an `<img src>` in the
 * admin panel (#634), which is why it is worth testing on its own.
 */

/** ~5MB decoded. A screenshot arrives re-encoded by the client at 1200px/q0.85. */
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

// Anchored, and the payload character class is base64's alphabet exactly, so a
// match is also proof the string decodes — no atob round-trip needed just to
// find out whether we are about to store junk that renders as a broken image.
const DATA_URL_RE = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Exact decoded length: 3 bytes per 4 base64 chars, less one per '=' pad. */
function decodedByteLength(base64Data: string): number {
  const padding = base64Data.endsWith("==") ? 2 : base64Data.endsWith("=") ? 1 : 0;
  return (base64Data.length / 4) * 3 - padding;
}

/**
 * Returns the data URL unchanged when it is a supported image within the size
 * cap, and `null` — with the reason logged — otherwise.
 *
 * Rejection is never fatal to the report: a bug report without its screenshot
 * is still worth filing, so callers drop the image and carry on.
 */
export function validateScreenshot(screenshot: string | undefined | null): string | null {
  if (!screenshot) return null;

  const match = DATA_URL_RE.exec(screenshot);
  if (!match) {
    console.error("Screenshot rejected: not a base64 image data URL");
    return null;
  }

  const [, mimeType, base64Data] = match;
  if (!ALLOWED_IMAGE_TYPES.has(mimeType)) {
    console.error(`Screenshot rejected: unsupported type ${mimeType}`);
    return null;
  }

  const bytes = decodedByteLength(base64Data);
  if (bytes > MAX_SCREENSHOT_BYTES) {
    console.error(`Screenshot rejected: ${bytes} bytes exceeds the 5MB limit`);
    return null;
  }

  return screenshot;
}
