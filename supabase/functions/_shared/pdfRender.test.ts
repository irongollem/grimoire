import { describe, expect, it } from "vitest";
import {
  PDF_HTML_MAX_BYTES,
  buildCloudflarePdfRequest,
  mapCloudflareResponse,
  parsePdfRequest,
} from "./pdfRender";

const DOC = "<!DOCTYPE html><html><body>Hi</body></html>";

describe("parsePdfRequest", () => {
  it("accepts a doctype document, ignoring leading whitespace and case", () => {
    const r = parsePdfRequest({ html: `  \n<!doctype HTML><p>x</p>` });
    expect(r).toEqual({ ok: true, value: { html: `  \n<!doctype HTML><p>x</p>` } });
  });

  it.each([null, "x", [], {}, { html: "" }, { html: "   " }, { html: 5 }])("rejects %j", (body) => {
    const r = parsePdfRequest(body);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(400);
  });

  it("rejects a document without a doctype", () => {
    const r = parsePdfRequest({ html: "<html></html>" });
    expect(r.ok).toBe(false);
  });

  it("measures the limit in bytes, not characters", () => {
    // 3-byte characters: character count is a third of the byte count.
    const chars = Math.floor(PDF_HTML_MAX_BYTES / 3) + 1;
    const html = DOC + "€".repeat(chars);
    expect(html.length).toBeLessThan(PDF_HTML_MAX_BYTES);
    const r = parsePdfRequest({ html });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(413);
      expect(r.error).toBe("This book is too large to export as one PDF (over 40 MB of pages and pictures).");
    }
  });

  it("accepts a document just under the limit", () => {
    const html = DOC + "a".repeat(PDF_HTML_MAX_BYTES - DOC.length);
    expect(parsePdfRequest({ html }).ok).toBe(true);
  });
});

describe("buildCloudflarePdfRequest", () => {
  const req = buildCloudflarePdfRequest("acc123", "tok", DOC);

  it("targets the Browser Run /pdf endpoint for the account", () => {
    expect(req.url).toBe("https://api.cloudflare.com/client/v4/accounts/acc123/browser-run/pdf");
  });

  it("sends bearer auth and JSON", () => {
    expect(req.init.method).toBe("POST");
    expect(req.init.headers).toEqual({ Authorization: "Bearer tok", "Content-Type": "application/json" });
  });

  it("sends the html and print options", () => {
    expect(JSON.parse(req.init.body)).toEqual({
      html: DOC,
      gotoOptions: { waitUntil: "networkidle0", timeout: 45000 },
      pdfOptions: { printBackground: true, preferCSSPageSize: true },
    });
  });
});

describe("mapCloudflareResponse", () => {
  it("passes a 2xx through as a pdf", () => {
    expect(mapCloudflareResponse(200, "")).toEqual({ kind: "pdf" });
  });

  it("maps a plain 429 to the busy message", () => {
    expect(mapCloudflareResponse(429, "Too many requests")).toEqual({
      kind: "error",
      status: 429,
      error: "The PDF printer is busy. Try again in a few seconds.",
      logDetail: null,
    });
  });

  it("maps the daily browser-time limit to the tomorrow message", () => {
    const r = mapCloudflareResponse(429, "Browser time limit exceeded for today");
    expect(r).toMatchObject({ kind: "error", status: 429, error: "PDF export has reached today's limit. Please try again tomorrow." });
  });

  it("maps anything else to 502 and truncates the logged body", () => {
    const r = mapCloudflareResponse(500, "x".repeat(2000));
    expect(r.kind).toBe("error");
    if (r.kind === "error") {
      expect(r.status).toBe(502);
      expect(r.error).toBe("The PDF could not be made. Please try again.");
      expect(r.logDetail).toBe(`status 500: ${"x".repeat(500)}`);
    }
  });

  it("treats a 4xx auth failure as 502 to the client", () => {
    const r = mapCloudflareResponse(403, "forbidden");
    expect(r).toMatchObject({ kind: "error", status: 502 });
  });
});
