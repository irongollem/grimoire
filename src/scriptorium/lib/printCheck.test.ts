import { describe, expect, it } from "vitest";
import { checkPrintedPages, compactText } from "./printCheck";
import type { ExpectedPage } from "./printCheck";

const TEXT = "The goblins crept along the flooded corridor and found nothing but cold water and a rusted key";

function page(over: Partial<ExpectedPage> = {}): ExpectedPage {
  return { index: 0, label: "14", text: TEXT, ignorable: [], ...over };
}

describe("checkPrintedPages", () => {
  it("passes a page that printed as laid out", () => {
    expect(checkPrintedPages([page()], [TEXT])).toEqual({ ok: true });
  });

  it("names a page whose last line fell off in print", () => {
    const result = checkPrintedPages([page()], ["The goblins crept along the flooded corridor and found nothing"]);
    expect(result).toEqual({
      ok: false,
      pages: [{ index: 0, label: "Page 14", reason: "ends with different words" }],
    });
  });

  it("names a page that starts somewhere else", () => {
    const result = checkPrintedPages([page()], ["flooded corridor and found nothing but cold water and a rusted key"]);
    expect(result).toEqual({
      ok: false,
      pages: [{ index: 0, label: "Page 14", reason: "starts with different words" }],
    });
  });

  it("names an extra page in the PDF", () => {
    const result = checkPrintedPages([page()], [TEXT, "stray"]);
    expect(result).toEqual({
      ok: false,
      pages: [{ index: 1, label: "Page 2 of the file", reason: "extra page" }],
    });
  });

  it("names a page the PDF is missing", () => {
    const result = checkPrintedPages([page(), page({ index: 1, label: "15" })], [TEXT]);
    expect(result).toEqual({
      ok: false,
      pages: [{ index: 1, label: "Page 15", reason: "page missing" }],
    });
  });

  it("names text the page did not have, such as the next page's lines pulled up", () => {
    const result = checkPrintedPages([page()], [`${TEXT} Chapter two begins in the cellar`]);
    expect(result).toEqual({
      ok: false,
      pages: [{ index: 0, label: "Page 14", reason: "has text the page did not" }],
    });
  });

  it("does not count the footer, in any place on the page, as a mismatch", () => {
    const withFooter = page({ ignorable: ["14", "The Sunken Keep", "14"] });
    expect(checkPrintedPages([withFooter], [`14 The Sunken Keep ${TEXT} 14`])).toEqual({ ok: true });
    expect(checkPrintedPages([withFooter], [`${TEXT} 14 The Sunken Keep 14`])).toEqual({ ok: true });
  });

  it("passes a blank page that printed blank and names a blank page that printed text", () => {
    const blank = page({ text: "", label: null, index: 3 });
    expect(checkPrintedPages([blank], [""])).toEqual({ ok: true });
    expect(checkPrintedPages([blank], ["Leftover words"])).toEqual({
      ok: false,
      pages: [{ index: 3, label: "Page 4 of the file", reason: "has text the page did not" }],
    });
  });

  it("is not fooled by hyphenation, ligatures or line breaks Chrome chose differently", () => {
    const fi = page({ text: "The official fireside notice about the flooded corridor and the rusted key" });
    const printed = "The of­ficial fireside no-\ntice about the flooded cor-\nridor and the rusted key";
    expect(checkPrintedPages([fi], [printed])).toEqual({ ok: true });
    expect(compactText("ﬁne")).toBe("fine");
  });

  it("names a page that lost a block from its middle, though its first and last words are there", () => {
    const long = page({
      text: `${TEXT} while the lamplighter lifted the lantern until the oil gutted and the water answered in the dark, and then ${TEXT.split(" ").slice(-6).join(" ")}`,
    });
    const printed = `${TEXT} ${TEXT.split(" ").slice(-6).join(" ")}`;
    expect(checkPrintedPages([long], [printed])).toEqual({
      ok: false,
      pages: [{ index: 0, label: "Page 14", reason: "is missing text the page had" }],
    });
  });

  it("does not mind a box printed before or after its neighbours, which pdf.js reads in paint order", () => {
    const withBox = page({ text: `Opening words of the page the box sits in the middle of ${TEXT}` });
    const reordered = `${TEXT} Opening words of the page the box sits in the middle of`;
    expect(checkPrintedPages([withBox], [reordered])).toEqual({ ok: true });
  });

  it("lets a few printed characters the text never had (a list number) pass", () => {
    expect(checkPrintedPages([page()], [`1. ${TEXT}`])).toEqual({ ok: true });
  });

  it("reports every differing page, in order", () => {
    const result = checkPrintedPages(
      [page({ index: 0, label: "1" }), page({ index: 1, label: "2" }), page({ index: 2, label: "3" })],
      [TEXT, "nothing here", TEXT],
    );
    expect(result.ok ? [] : result.pages.map((p) => p.label)).toEqual(["Page 2"]);
  });
});
