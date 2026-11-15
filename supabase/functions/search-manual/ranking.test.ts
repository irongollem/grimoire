import { describe, expect, it } from "vitest";
import {
  buildJudgeRequest,
  choiceProbabilities,
  rankSuggestions,
  validatePayload,
  PayloadValidationError,
  SUGGEST_MIN_PROBABILITY,
} from "./ranking";

const page = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: `Title ${id}`, summary: `Sum ${id}`, ...extra });
const body = (over: Record<string, unknown> = {}) => ({
  campaignId: "c1",
  query: "how do I hide an NPC",
  pages: [page("a")],
  ...over,
});

describe("validatePayload", () => {
  it("refuses a query under 8 characters (a short fragment is not a question worth a model call)", () => {
    expect(() => validatePayload(body({ query: "  hide  " }))).toThrow(PayloadValidationError);
    expect(validatePayload(body({ query: "  12345678  " })).query).toBe("12345678");
  });

  it("refuses a query over 300 characters", () => {
    expect(() => validatePayload(body({ query: "x".repeat(301) }))).toThrow(PayloadValidationError);
  });

  it("refuses more than 150 pages (unbounded prompt size)", () => {
    const pages = Array.from({ length: 151 }, (_, i) => page(`p${i}`));
    expect(() => validatePayload(body({ pages }))).toThrow(PayloadValidationError);
    expect(validatePayload(body({ pages: pages.slice(0, 150) })).pages).toHaveLength(150);
  });

  it("refuses a duplicate page id (one option name would silently shadow the other)", () => {
    expect(() => validatePayload(body({ pages: [page("a"), page("a")] }))).toThrow(PayloadValidationError);
  });

  it("refuses a page named none, which would collide with the escape option", () => {
    expect(() => validatePayload(body({ pages: [page("none")] }))).toThrow(PayloadValidationError);
  });

  it("cuts a summary over 300 characters instead of rejecting it", () => {
    const out = validatePayload(body({ pages: [page("a", { summary: "s".repeat(500) })] }));
    expect(out.pages[0].summary).toHaveLength(300);
  });

  it("refuses an empty page list", () => {
    expect(() => validatePayload(body({ pages: [] }))).toThrow(PayloadValidationError);
  });
});

describe("buildJudgeRequest", () => {
  it("offers every page plus none, described as title and summary", () => {
    const req = buildJudgeRequest("how do I hide an NPC", [page("a")]);
    expect(req.questions.page.criteria).toEqual({
      a: "Title a: Sum a",
      none: "The question is not about using this app, or no page covers it.",
    });
    expect(req.state).toEqual({ question: "how do I hide an NPC" });
  });
});

describe("choiceProbabilities", () => {
  it("is null for an answer of another type", () => {
    expect(choiceProbabilities({ page: { type: "score", score: 1 } }, "page")).toBeNull();
    expect(choiceProbabilities({}, "page")).toBeNull();
  });
  it("reads the probabilities of a choice answer", () => {
    expect(choiceProbabilities({ page: { type: "choice", choice: "a", probabilities: { a: 0.9, b: "x" } } }, "page")).toEqual({ a: 0.9 });
  });
});

describe("rankSuggestions", () => {
  const sent = new Set(["a", "b", "c", "d", "e"]);

  it("returns nothing when none leads at 0.5 or more", () => {
    expect(rankSuggestions({ none: 0.6, a: 0.3, b: 0.1 }, sent)).toEqual([]);
  });

  it("still suggests when none holds 0.5 but another option is higher", () => {
    expect(rankSuggestions({ none: 0.5, a: 0.5001 }, sent).map((s) => s.id)).toEqual(["a"]);
  });

  it("still suggests when none leads but under 0.5", () => {
    expect(rankSuggestions({ none: 0.4, a: 0.35, b: 0.25 }, sent).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("leaves out a page under the minimum probability", () => {
    const out = rankSuggestions({ a: 0.9, b: SUGGEST_MIN_PROBABILITY - 0.01 }, sent);
    expect(out.map((s) => s.id)).toEqual(["a"]);
  });

  it("returns at most three, highest first", () => {
    const out = rankSuggestions({ a: 0.1, b: 0.4, c: 0.2, d: 0.25, e: 0.15 }, sent);
    expect(out.map((s) => s.id)).toEqual(["b", "d", "c"]);
  });

  it("drops an id the model returned that was not sent", () => {
    expect(rankSuggestions({ ghost: 0.9, a: 0.1 }, sent).map((s) => s.id)).toEqual(["a"]);
  });

  it("never suggests none itself", () => {
    expect(rankSuggestions({ none: 0.3, a: 0.7 }, sent).map((s) => s.id)).toEqual(["a"]);
  });
});
