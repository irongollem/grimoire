// Decisions behind the render-pdf edge function (#565), kept pure so they can be
// tested without Deno, the network or a Cloudflare account. index.ts only does I/O.

/**
 * Cloudflare's /pdf endpoint rejects bodies over 50 MB. The HTML travels inside a
 * JSON envelope twice (client -> us, us -> Cloudflare) and JSON escaping grows it,
 * so the cap on the raw HTML leaves headroom.
 */
export const PDF_HTML_MAX_BYTES = 40 * 1024 * 1024;

export type PdfRequestResult =
  | { ok: true; value: { html: string } }
  | { ok: false; status: 400 | 413; error: string };

const utf8Bytes = (text: string): number => new TextEncoder().encode(text).length;

export function parsePdfRequest(body: unknown): PdfRequestResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, status: 400, error: "The PDF request was not understood." };
  }
  const { html } = body as { html?: unknown };
  if (typeof html !== "string" || html.trim() === "") {
    return { ok: false, status: 400, error: "There is no book to print." };
  }
  if (!/^<!doctype html/i.test(html.trimStart())) {
    return { ok: false, status: 400, error: "The book must be a complete HTML page." };
  }
  // Bytes, not characters: the limit is on what goes over the wire, and a
  // character count undercounts anything outside ASCII (pictures as data: URIs
  // are ASCII, but book text and inlined fonts' names are not).
  if (utf8Bytes(html) > PDF_HTML_MAX_BYTES) {
    return {
      ok: false,
      status: 413,
      error: "This book is too large to export as one PDF (over 40 MB of pages and pictures).",
    };
  }
  return { ok: true, value: { html } };
}

export interface CloudflarePdfRequest {
  url: string;
  init: { method: "POST"; headers: Record<string, string>; body: string };
}

export function buildCloudflarePdfRequest(
  accountId: string,
  token: string,
  html: string,
): CloudflarePdfRequest {
  return {
    // Browser Run, renamed from Browser Rendering in April 2026.
    url: `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/browser-run/pdf`,
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        html,
        // networkidle0 so inlined fonts and CDN pictures have settled before printing.
        gotoOptions: { waitUntil: "networkidle0", timeout: 45_000 },
        // The book is already paginated by Paged.js; the page size comes from its @page rule.
        pdfOptions: { printBackground: true, preferCSSPageSize: true },
      }),
    },
  };
}

export type PdfOutcome =
  | { kind: "pdf" }
  | { kind: "error"; status: 429 | 502; error: string; logDetail: string | null };

/**
 * Maps Cloudflare's status (and, on failure, the first part of its body) to what
 * the client is told. `logDetail` is for console.error only: a truncated CF
 * message, never the token or the HTML.
 */
export function mapCloudflareResponse(status: number, failureBody: string): PdfOutcome {
  if (status >= 200 && status < 300) return { kind: "pdf" };
  const detail = `status ${status}: ${failureBody.slice(0, 500)}`;
  if (status === 429) {
    const daily = /time limit exceeded|daily/i.test(failureBody);
    return {
      kind: "error",
      status: 429,
      error: daily
        ? "PDF export has reached today's limit. Please try again tomorrow."
        : "The PDF printer is busy. Try again in a few seconds.",
      logDetail: null,
    };
  }
  return {
    kind: "error",
    status: 502,
    error: "The PDF could not be made. Please try again.",
    logDetail: detail,
  };
}
