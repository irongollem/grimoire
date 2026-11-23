import { describe, expect, it } from "vitest";
import { askInline, parseAskMarkdown } from "./askMarkdown";

describe("askInline", () => {
  // Bug caught: replies showed literal asterisks around bold and italic words.
  it("turns **bold** and *italic* into runs without the asterisks", () => {
    expect(askInline("a **b** and *c*")).toEqual([
      { text: "a ", bold: false, italic: false },
      { text: "b", bold: true, italic: false },
      { text: " and ", bold: false, italic: false },
      { text: "c", bold: false, italic: true },
    ]);
  });

  it("leaves a lone asterisk and unclosed markers as written", () => {
    expect(askInline("2 * 3 and **open")).toEqual([{ text: "2 * 3 and **open", bold: false, italic: false }]);
  });
});

describe("parseAskMarkdown", () => {
  it("makes paragraphs of blank-line groups and keeps single line breaks inside one", () => {
    const blocks = parseAskMarkdown("one\ntwo\n\nthree");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ kind: "paragraph" });
    expect(blocks[0].kind === "paragraph" && blocks[0].lines).toHaveLength(2);
  });

  it("reads dash and asterisk bullets as one list and numbers as another", () => {
    const blocks = parseAskMarkdown("- a\n* b\n\n1. x\n2) y");
    expect(blocks.map((b) => b.kind)).toEqual(["ul", "ol"]);
    expect(blocks[0].kind === "ul" && blocks[0].items).toHaveLength(2);
  });

  it("never recognises HTML, links or code: they stay text", () => {
    const [block] = parseAskMarkdown("<script>x()</script> [a](http://b) `c`");
    expect(block.kind === "paragraph" && block.lines[0].map((r) => r.text).join("")).toBe("<script>x()</script> [a](http://b) `c`");
  });
});
