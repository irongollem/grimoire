import { describe, expect, it } from "vitest";
import type { ManualPageSource } from "./buildIndex.ts";
import { MANUAL_PAGES } from "./manualPages.generated.ts";
import { excerptOf, MANUAL_TEXT_MAX, searchManual } from "./searchManual.ts";

const page = (id: string, over: Partial<ManualPageSource> = {}): ManualPageSource => ({
  id, title: id, section: "S", summary: "", keywords: [], body: "", ...over,
});

describe("searchManual on the real manual", () => {
  // Bug caught: the exchange that started this (#1253): "about" versus "known to" on a backstory connection was not
  // found in the manual, so Ask guessed. The Canon page answers it.
  it("finds the Canon page first for the about / known to question", () => {
    const hits = searchManual("about known to backstory connection", MANUAL_PAGES);
    expect(hits[0]?.id).toBe("worldbuilding-canon");
  });

  // Bug caught: a nonsense query matching something anyway, so a real gap would never reach the ledger.
  it("returns nothing for a query the manual does not cover", () => {
    expect(searchManual("zzqx flurble wombat", MANUAL_PAGES)).toEqual([]);
  });
});

describe("searchManual ranking", () => {
  // Bug caught: weights flattened, so a page that merely mentions a word outranks the page named for it.
  it("ranks a title match over a body mention", () => {
    const pages = [page("a", { title: "Soundboard" }), page("b", { title: "Other", body: "soundboard soundboard soundboard" })];
    expect(searchManual("soundboard", pages).map((h) => h.id)).toEqual(["a", "b"]);
  });

  // Bug caught: no stemming, so "connections" (plural) found nothing.
  it("matches a plural query against a singular page", () => {
    expect(searchManual("connections", [page("a", { keywords: ["connection"] })]).map((h) => h.id)).toEqual(["a"]);
  });

  // Bug caught: stop words scored, so "how do I" matched every page.
  it("ignores stop words", () => {
    expect(searchManual("how do i", [page("a", { body: "how do i do it" })])).toEqual([]);
  });

  // Bug caught: the limit ignored, flooding the turn with pages.
  it("returns at most `limit` pages", () => {
    const pages = ["a", "b", "c", "d"].map((id) => page(id, { title: "map" }));
    expect(searchManual("map", pages, 2)).toHaveLength(2);
  });
});

describe("excerptOf", () => {
  const section = (name: string, filler: string) => `## ${name}\n${filler.repeat(400)}`;
  const body = ["Intro line.", section("Alpha", "aaaa "), section("Needle", "needle words "), section("Omega", "zzzz ")].join("\n");

  // Bug caught: a long page cut from the top, so the section that answers the question (late on the page) never reaches the model.
  it("keeps the section that holds the terms and stays under the limit", () => {
    const text = excerptOf(body, ["needle"]);
    expect(text).toContain("## Needle");
    expect(text.length).toBeLessThanOrEqual(MANUAL_TEXT_MAX + 10);
  });

  // Bug caught: a short page cut or rearranged for no reason.
  it("returns a short page whole", () => {
    expect(excerptOf("Short page.", ["short"])).toBe("Short page.");
  });
});
