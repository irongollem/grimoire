import { describe, expect, it } from "vitest";
import { capText, rankCandidates, rulesAnswer, searchTerms, RULES_TEXT_MAX, type RulesCandidate } from "./askRules";

const cand = (name: string, text: string): RulesCandidate => ({ kind: "rule", name, source: "srd-2024", text });

describe("searchTerms", () => {
  // Bug caught: a comma or parenthesis in the DM's question reaching the PostgREST `or(...)` filter and changing it.
  it("keeps letters and digits only, and drops stop words", () => {
    expect(searchTerms("How does grappling (and, uh, 5ft) work?")).toEqual(["grappling", "uh", "5ft"]);
  });
});

describe("rankCandidates", () => {
  // Bug caught: a rule that merely mentions grappling three times outranking the entry called "Grappling".
  it("puts a name hit before a body hit, even when the body matches more words", () => {
    const body = cand("Unarmed Strike", "grapple grappling escape");
    const named = cand("Grappling", "You seize a creature.");
    expect(rankCandidates([body, named], ["grapple", "grappling", "escape"]).map((c) => c.name)).toEqual(["Grappling", "Unarmed Strike"]);
  });

  // Bug caught: rows the database returned for one word being kept even though neither name nor text holds any term.
  it("drops a candidate that matches no term", () => {
    expect(rankCandidates([cand("Cover", "A wall.")], ["grapple"])).toEqual([]);
  });
});

describe("capText", () => {
  // Bug caught: a rule cut mid-sentence, so the model quotes half a rule as the whole.
  it("cuts at the last paragraph that fits and says the book goes on", () => {
    const text = `${"a".repeat(2000)}\n\n${"b".repeat(2000)}`;
    const out = capText(text);
    expect(out.startsWith("a".repeat(2000))).toBe(true);
    expect(out).not.toContain("bbb");
    expect(out).toContain("The book goes on");
    expect(out.length).toBeLessThanOrEqual(RULES_TEXT_MAX + 80);
  });

  it("leaves a short text whole", () => {
    expect(capText("Short.\n\nText.")).toBe("Short.\n\nText.");
  });
});

describe("rulesAnswer", () => {
  // Bug caught: the answer dropping the book's title, so the model cannot name the book it quotes.
  it("names each hit's book and the edition", () => {
    const parsed = JSON.parse(rulesAnswer("grappled", { status: "ok", edition: "2024", books: ["Grimoire Rules"], hits: [{ ...cand("Grappled", "Speed 0."), sourceTitle: "Grimoire Rules" }] })) as { hits: Array<{ book: string }>; note: string };
    expect(parsed.hits[0].book).toBe("Grimoire Rules");
    expect(parsed.note).toContain("2024");
  });
});
