// @vitest-environment jsdom
// DOMPurify needs a spec-complete DOM; happy-dom (the repo default) makes it
// strip ALL tags (see chatMarkdown.test.ts), so this file runs under jsdom —
// which matches real-browser behaviour, the only place this sink renders.
import { describe, it, expect } from "vitest";
import { renderBasicMarkdown, sanitizeHtml } from "./sanitizeHtml";

describe("sanitizeHtml", () => {
  it("preserves data-ai-generated and data-ai-model on the AI content wrapper (#606)", () => {
    const html = '<div data-ai-generated="true" data-ai-model="gpt-5"><p>Recap text</p></div>';
    const clean = sanitizeHtml(html);
    expect(clean).toContain('data-ai-generated="true"');
    expect(clean).toContain('data-ai-model="gpt-5"');
    expect(clean).toContain("Recap text");
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

describe("renderBasicMarkdown", () => {
  it("is empty for nothing", () => {
    expect(renderBasicMarkdown(null)).toBe("");
    expect(renderBasicMarkdown("")).toBe("");
  });

  it("escapes markup before it adds its own, so typed HTML stays text", () => {
    const html = renderBasicMarkdown('<img src=x onerror="alert(1)"> **bold**');
    expect(html).toBe('<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt; <strong>bold</strong></p>');
  });

  it("turns blank-line breaks into paragraphs, single newlines into <br>, and *x* into emphasis", () => {
    expect(renderBasicMarkdown("one\ntwo\n\nthree *four*")).toBe("<p>one<br>two</p><p>three <em>four</em></p>");
  });
});
