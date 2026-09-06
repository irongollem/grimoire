import { describe, expect, it } from "vitest";
import { normalizeSourceHtml, sourceHtmlToTiptapContent } from "./sourceHtml";

describe("normalizeSourceHtml", () => {
  it("converts an <aside> into a <blockquote>, keeping its content", () => {
    const out = normalizeSourceHtml("<aside><p>The door creaks open.</p></aside>");
    expect(out).toBe("<blockquote><p>The door creaks open.</p></blockquote>");
  });

  it("converts an element with a hinted class into a <blockquote>", () => {
    const out = normalizeSourceHtml('<div class="read-aloud-text">You smell smoke.</div>');
    expect(out).toBe("<blockquote>You smell smoke.</blockquote>");
  });

  it("matches a hinted class case-insensitively and as a substring", () => {
    const out = normalizeSourceHtml('<p class="Read-Aloud-Box">Boxed text.</p>');
    expect(out).toBe("<blockquote>Boxed text.</blockquote>");
  });

  it("leaves an element with an unrelated class untouched", () => {
    const out = normalizeSourceHtml('<div class="callout warning">Careful!</div>');
    expect(out).toBe('<div class="callout warning">Careful!</div>');
  });

  it("strips <script> and <style> entirely", () => {
    const out = normalizeSourceHtml(
      "<p>Before</p><script>alert(1)</script><style>.x{color:red}</style><p>After</p>",
    );
    expect(out).toBe("<p>Before</p><p>After</p>");
  });

  it("strips <figure> and its contents, including a nested <figcaption>", () => {
    const out = normalizeSourceHtml(
      '<figure><img src="x.png"><figcaption>A owlbear</figcaption></figure><p>Text</p>',
    );
    expect(out).toBe("<p>Text</p>");
  });

  it("unwraps a tooltip <a>, keeping its text", () => {
    const out = normalizeSourceHtml('<p>Beware the <a href="/rules/grapple">grappled</a> condition.</p>');
    expect(out).toBe("<p>Beware the grappled condition.</p>");
  });

  it("passes unknown structural tags through untouched", () => {
    const out = normalizeSourceHtml("<section><h2>Title</h2><p>Body</p></section>");
    expect(out).toBe("<section><h2>Title</h2><p>Body</p></section>");
  });

  it("handles a full clipboard document (html/head/body) by returning only the body", () => {
    const out = normalizeSourceHtml(
      "<html><head><style>body{color:red}</style></head><body><p>Hello</p></body></html>",
    );
    expect(out).toBe("<p>Hello</p>");
  });

  it("does not crash on an aside nested inside a stripped figure", () => {
    const out = normalizeSourceHtml("<figure><aside>Caption text</aside></figure><p>Kept</p>");
    expect(out).toBe("<p>Kept</p>");
  });
});

describe("sourceHtmlToTiptapContent", () => {
  it("converts headings h1-h6 with the right level", () => {
    const html = [1, 2, 3, 4, 5, 6].map((l) => `<h${l}>Heading ${l}</h${l}>`).join("");
    const content = sourceHtmlToTiptapContent(html);
    expect(content).toHaveLength(6);
    content.forEach((node, i) => {
      expect(node.type).toBe("heading");
      expect((node.attrs as { level: number }).level).toBe(i + 1);
    });
  });

  it("converts a paragraph", () => {
    const content = sourceHtmlToTiptapContent("<p>Plain text.</p>");
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("paragraph");
  });

  it("converts an <aside> into a blockquote node end to end", () => {
    const content = sourceHtmlToTiptapContent("<aside><p>You hear a growl.</p></aside>");
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("blockquote");
  });

  it("converts bullet and ordered lists", () => {
    const bullet = sourceHtmlToTiptapContent("<ul><li>One</li><li>Two</li></ul>");
    expect(bullet[0].type).toBe("bulletList");
    const ordered = sourceHtmlToTiptapContent("<ol><li>One</li><li>Two</li></ol>");
    expect(ordered[0].type).toBe("orderedList");
  });

  it("converts a table into table/tableRow/tableCell nodes", () => {
    const content = sourceHtmlToTiptapContent(
      "<table><tr><th>Name</th><th>HP</th></tr><tr><td>Owlbear</td><td>59</td></tr></table>",
    );
    expect(content[0].type).toBe("table");
    const rows = content[0].content as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    expect((rows[0].content as Record<string, unknown>[])[0].type).toBe("tableHeader");
    expect((rows[1].content as Record<string, unknown>[])[0].type).toBe("tableCell");
  });

  it("converts bold and italic marks", () => {
    const content = sourceHtmlToTiptapContent("<p><strong>bold</strong> and <em>italic</em></p>");
    const text = content[0].content as Record<string, unknown>[];
    const boldNode = text.find((n) => n.text === "bold");
    expect(boldNode?.marks).toEqual([{ type: "bold" }]);
    const italicNode = text.find((n) => n.text === "italic");
    expect(italicNode?.marks).toEqual([{ type: "italic" }]);
  });

  it("falls back to a single empty paragraph for empty input", () => {
    // ProseMirror's own doc content model ("block+") never produces zero
    // blocks — ".content" always yields something. This is worth pinning
    // rather than special-cased away in `sourceHtmlToTiptapContent`, since
    // the caller merges this result straight into another doc's content and
    // an occasional harmless empty paragraph is far cheaper than special-
    // casing "nothing came back" at every call site.
    expect(sourceHtmlToTiptapContent("")).toEqual([{ type: "paragraph" }]);
  });
});
