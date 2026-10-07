import { describe, expect, it } from "vitest";
import { markdownToInlineNodes, markdownToTiptapNodes, type TiptapNode } from "./markdownDocument";
import { tiptapToMarkdown } from "./tiptapToMarkdown";

const types = (nodes: TiptapNode[]) => nodes.map((n) => n.type);
const first = (md: string, options?: Parameters<typeof markdownToTiptapNodes>[1]) => markdownToTiptapNodes(md, options)[0];

describe("markdownToTiptapNodes", () => {
  it("covers headings, paragraphs, rules and code", () => {
    const nodes = markdownToTiptapNodes("# T\n\nBody\n\n---\n\n```js\nlet a = 1 < 2;\n```");
    expect(types(nodes)).toEqual(["heading", "paragraph", "horizontalRule", "codeBlock"]);
    expect(nodes[0]).toMatchObject({ attrs: { level: 1 } });
    expect(nodes[3]).toEqual({
      type: "codeBlock",
      attrs: { language: "js" },
      content: [{ type: "text", text: "let a = 1 < 2;" }],
    });
  });

  it("nests marks and decodes entities", () => {
    const para = first("**bold _both_** ~~gone~~ `x<y` a &amp; b") as { content: TiptapNode[] };
    expect(para.content).toEqual([
      { type: "text", text: "bold ", marks: [{ type: "bold" }] },
      { type: "text", text: "both", marks: [{ type: "bold" }, { type: "italic" }] },
      { type: "text", text: " " },
      { type: "text", text: "gone", marks: [{ type: "strike" }] },
      { type: "text", text: " " },
      { type: "text", text: "x<y", marks: [{ type: "code" }] },
      { type: "text", text: " a & b" },
    ]);
  });

  it("joins soft wraps and honours hard breaks", () => {
    const para = first("one\ntwo  \nthree") as { content: TiptapNode[] };
    expect(para.content.map((n) => n.type)).toEqual(["text", "hardBreak", "text"]);
    expect(para.content[0]).toEqual({ type: "text", text: "one two" });
  });

  it("builds nested lists and task lists", () => {
    const [bullets] = markdownToTiptapNodes("- a\n  - b\n- c");
    expect(bullets.type).toBe("bulletList");
    const firstItem = (bullets.content as TiptapNode[])[0];
    expect(types(firstItem.content as TiptapNode[])).toEqual(["paragraph", "bulletList"]);

    const [tasks] = markdownToTiptapNodes("- [ ] open\n- [x] done");
    expect(tasks.type).toBe("taskList");
    expect((tasks.content as TiptapNode[]).map((i) => (i.attrs as { checked: boolean }).checked)).toEqual([false, true]);

    expect(first("3. x\n4. y")).toMatchObject({ type: "orderedList", attrs: { start: 3 } });
  });

  it("turns an Obsidian callout into a blockquote with a bold title line", () => {
    const quote = first("> [!warning] Beware\n> The floor *gives* way.") as { content: TiptapNode[] };
    expect(quote.content[0]).toEqual({ type: "paragraph", content: [{ type: "text", text: "Beware", marks: [{ type: "bold" }] }] });
    expect(quote.content[1]).toMatchObject({ type: "paragraph" });
    expect(JSON.stringify(quote)).toContain("gives");
    const bare = first("> [!tip]\n> Hint") as { content: TiptapNode[] };
    expect(JSON.stringify(bare.content[0])).toContain("Tip");
  });

  it("reads the export's `[!secret]` callout back as a DM-only block, round trip included", () => {
    const secret = first("> [!secret] DM only\n> The duke *is* the cult leader.") as TiptapNode;
    expect(secret.type).toBe("secretBlock");
    expect(JSON.stringify(secret)).toContain("cult leader");
    expect(JSON.stringify(secret)).not.toContain("DM only");

    const doc = { type: "doc", content: [{ type: "secretBlock", content: [{ type: "paragraph", content: [{ type: "text", text: "Hidden" }] }] }] };
    expect(first(tiptapToMarkdown(doc))).toEqual(doc.content[0]);
  });

  it("builds tables with header cells and inline marks", () => {
    const table = first("| a | b |\n|---|---|\n| 1 | **2** |") as { content: { content: TiptapNode[] }[] };
    expect(table.content).toHaveLength(2);
    expect(table.content[0].content.map((c) => c.type)).toEqual(["tableHeader", "tableHeader"]);
    expect(JSON.stringify(table.content[1])).toContain('"bold"');
  });

  it("makes links into link marks, or lets a hook claim them", () => {
    const plain = first("see [Bob](https://x.test/b)") as { content: TiptapNode[] };
    expect(plain.content[1]).toEqual({ type: "text", text: "Bob", marks: [{ type: "link", attrs: { href: "https://x.test/b" } }] });
    const claimed = first("see [Bob](Bob.md)", {
      link: ({ href, label }) => (href.endsWith(".md") ? { type: "x", attrs: { href, label } } : null),
    }) as { content: TiptapNode[] };
    expect(claimed.content[1]).toEqual({ type: "x", attrs: { href: "Bob.md", label: "Bob" } });
  });

  describe("wikilinks", () => {
    const hook = (l: { target: string; label: string; embed: boolean }) => (l.embed ? [] : { type: "ref", attrs: { target: l.target, label: l.label } });
    const refs = (md: string) => (first(md, { wikilink: hook }) as { content: TiptapNode[] }).content;

    it("leaves them literal without a hook", () => {
      expect(JSON.stringify(first("a [[B]] c"))).toContain("[[B]]");
    });

    it("parses target, alias, folder, heading and block anchors", () => {
      expect(refs("[[Bob]]")[0]).toMatchObject({ attrs: { target: "Bob", label: "Bob" } });
      expect(refs("[[Bob|The Bold]]")[0]).toMatchObject({ attrs: { target: "Bob", label: "The Bold" } });
      expect(refs("[[NPCs/Bob|Bob]]")[0]).toMatchObject({ attrs: { target: "NPCs/Bob", label: "Bob" } });
      expect(refs("[[Bob#History]]")[0]).toMatchObject({ attrs: { target: "Bob", label: "Bob" } });
      expect(refs("[[Bob#^abc|x]]")[0]).toMatchObject({ attrs: { target: "Bob", label: "x" } });
      expect(refs("[[A/B/C]]")[0]).toMatchObject({ attrs: { label: "C" } });
    });

    it("lets the hook drop an embed and keeps surrounding marks on a produced node", () => {
      expect(refs("x ![[pic.png]] y").map((n) => n.type)).toEqual(["text", "text"]);
      expect(refs("**[[Bob]]**")[0]).toMatchObject({ type: "ref", marks: [{ type: "bold" }] });
    });

    it("does not choke on an unclosed bracket", () => {
      expect(JSON.stringify(first("a [[b", { wikilink: hook }))).toContain("[[b");
    });
  });

  it("keeps raw HTML as text by default and strips it on request", () => {
    expect(JSON.stringify(first("hi <b>x</b>"))).toContain("<b>");
    const stripped = first("hi <b>x</b><br>y", { html: "strip" }) as { content: TiptapNode[] };
    expect(stripped.content.map((n) => n.type)).toEqual(["text", "text", "hardBreak", "text"]);
    expect(types(markdownToTiptapNodes("<div>hello</div>", { html: "strip" }))).toEqual(["paragraph"]);
  });

  it("returns an empty array for blank input", () => {
    expect(markdownToTiptapNodes("  \n\n")).toEqual([]);
  });
});

describe("markdownToInlineNodes", () => {
  it("converts emphasis without block-lexing a leading number", () => {
    expect(markdownToInlineNodes("15. On a *success*")).toEqual([
      { type: "text", text: "15. On a " },
      { type: "text", text: "success", marks: [{ type: "italic" }] },
    ]);
  });
});
