import { describe, expect, it } from "vitest";
import {
  MAX_TRUTH_SUGGESTIONS,
  sanitizePremise,
  sanitizeTruths,
  type KnowerCandidate,
} from "./canonSuggestions";

const people: KnowerCandidate[] = [
  { kind: "npc", id: "n1", name: "Mara Voss" },
  { kind: "faction", id: "f1", name: "The Iron Concord" },
  { kind: "party_member", id: "p1", name: "Tilda" },
];

describe("sanitizePremise", () => {
  it("refuses a line or a veil, which the table agrees on and the model must never write", () => {
    const out = sanitizePremise({ suggestions: [{ kind: "line", text: "No harm to children" }, { kind: "veil", text: "War" }, { kind: "theme", text: "Mercy" }] }, []);
    expect(out.suggestions).toEqual([{ kind: "theme", text: "Mercy" }]);
    expect(out.setAside).toHaveLength(2);
  });

  it("drops a kind the model invented", () => {
    expect(sanitizePremise({ suggestions: [{ kind: "plot", text: "x" }] }, []).suggestions).toEqual([]);
  });

  it("keeps one pitch, voice and look only, so an answer cannot offer two of a single-entry kind", () => {
    const out = sanitizePremise({ suggestions: [{ kind: "pitch", text: "A" }, { kind: "pitch", text: "B" }, { kind: "theme", text: "C" }, { kind: "theme", text: "D" }] }, []);
    expect(out.suggestions.map((s) => s.text)).toEqual(["A", "C", "D"]);
  });

  it("drops what the campaign already holds, case and spacing aside", () => {
    const out = sanitizePremise({ suggestions: [{ kind: "theme", text: "  kindness   is courage " }] }, [{ kind: "theme", text: "Kindness is courage" }]);
    expect(out.suggestions).toEqual([]);
  });

  it("trims and caps a long line", () => {
    const out = sanitizePremise({ suggestions: [{ kind: "theme", text: ` ${"a".repeat(900)} ` }] }, []);
    expect(out.suggestions[0].text.length).toBe(300);
  });

  it("survives a non-object answer", () => {
    expect(sanitizePremise("nope", []).suggestions).toEqual([]);
  });
});

describe("sanitizeTruths", () => {
  it("matches a known_to name back to the real record, case insensitively", () => {
    const out = sanitizeTruths({ suggestions: [{ title: "The bell tolls for the drowned", knowledge: "some", known_to: ["mara voss", "THE IRON CONCORD"] }] }, people, []);
    expect(out.suggestions[0].knowers).toEqual([people[0], people[1]]);
  });

  it("never turns an unknown name into a knower, and reports it", () => {
    const out = sanitizeTruths({ suggestions: [{ title: "T", knowledge: "some", known_to: ["Mara Voss", "Lord Nobody"] }] }, people, []);
    expect(out.suggestions[0].knowers).toEqual([people[0]]);
    expect(out.setAside.map((a) => a.claim)).toEqual(["Lord Nobody"]);
  });

  it("sets aside a 'some' truth with no real knower rather than offering a truth nobody knows", () => {
    const out = sanitizeTruths({ suggestions: [{ title: "T", knowledge: "some", known_to: ["Lord Nobody"] }, { title: "U", knowledge: "some" }] }, people, []);
    expect(out.suggestions).toEqual([]);
    expect(out.setAside.some((a) => a.claim === "T")).toBe(true);
    expect(out.setAside.some((a) => a.claim === "U")).toBe(true);
  });

  it("gives an 'all' or 'secret' truth no knowers even if the model named some", () => {
    const out = sanitizeTruths({ suggestions: [{ title: "A", knowledge: "all", known_to: ["Mara Voss"] }, { title: "B", knowledge: "secret", known_to: ["Tilda"] }] }, people, []);
    expect(out.suggestions.map((s) => s.knowers)).toEqual([[], []]);
  });

  it("drops a mark that is not all, some or secret", () => {
    expect(sanitizeTruths({ suggestions: [{ title: "A", knowledge: "most" }] }, people, []).suggestions).toEqual([]);
  });

  it("drops a truth the campaign already has", () => {
    expect(sanitizeTruths({ suggestions: [{ title: "the sea is salt", knowledge: "all" }] }, people, ["The sea is salt"]).suggestions).toEqual([]);
  });

  it("offers at most eight", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ title: `Truth ${i}`, knowledge: "all" }));
    expect(sanitizeTruths({ suggestions: many }, people, []).suggestions).toHaveLength(MAX_TRUTH_SUGGESTIONS);
  });

  it("names a knower once", () => {
    const out = sanitizeTruths({ suggestions: [{ title: "T", knowledge: "some", known_to: ["Tilda", "tilda"] }] }, people, []);
    expect(out.suggestions[0].knowers).toHaveLength(1);
  });
});
