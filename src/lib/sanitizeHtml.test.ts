// @vitest-environment jsdom
// DOMPurify needs a spec-complete DOM; happy-dom (the repo default) makes it
// strip ALL tags (see chatMarkdown.test.ts), so this file runs under jsdom —
// which matches real-browser behaviour, the only place this sink renders.
import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "./sanitizeHtml";

describe("sanitizeHtml", () => {
  it("preserves data-ai-generated and data-ai-model on the AI content wrapper (#606)", () => {
    const html = '<div data-ai-generated="true" data-ai-model="gpt-5"><p>Recap text</p></div>';
    const clean = sanitizeHtml(html);
    expect(clean).toContain('data-ai-generated="true"');
    expect(clean).toContain('data-ai-model="gpt-5"');
    expect(clean).toContain("Recap text");
  });

  it("preserves the marker even without a known model (data-ai-model omitted)", () => {
    const html = '<div data-ai-generated="true"><p>Recap text</p></div>';
    const clean = sanitizeHtml(html);
    expect(clean).toContain('data-ai-generated="true"');
  });

  it("strips onclick and other event-handler attributes on the same element", () => {
    const html =
      '<div data-ai-generated="true" data-ai-model="gpt-5" onclick="alert(1)"><p onmouseover="alert(2)">Recap text</p></div>';
    const clean = sanitizeHtml(html);
    expect(clean).toContain('data-ai-generated="true"');
    expect(clean).toContain('data-ai-model="gpt-5"');
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("onmouseover");
    expect(clean).not.toContain("alert(");
  });

  it("strips <script> tags nested inside the AI content wrapper", () => {
    const html =
      '<div data-ai-generated="true" data-ai-model="gpt-5"><script>alert("xss")</script><p>Recap text</p></div>';
    const clean = sanitizeHtml(html);
    expect(clean).toContain('data-ai-generated="true"');
    expect(clean).not.toContain("<script>");
    expect(clean).not.toContain("alert(");
  });

  it("strips javascript: URIs while leaving the marker intact", () => {
    const html =
      '<div data-ai-generated="true" data-ai-model="gpt-5"><a href="javascript:alert(1)">click</a></div>';
    const clean = sanitizeHtml(html);
    expect(clean).toContain('data-ai-generated="true"');
    expect(clean).not.toContain("javascript:");
  });
});
