import { describe, expect, it } from "vitest";
import type { KinPerson } from "@/lib/kinship/graph";
import { suggestSort } from "@/lib/kinship/sortSuggestions";

const p = (name: string, bornYear: number | null): KinPerson => ({
  key: `npc:${name}`,
  name,
  bornYear,
  diedYear: null,
  dead: false,
  isPc: false,
});
const odile = p("Odile Thane", 1033);
const garrick = p("Garrick Vane", 1030);

describe("suggestSort from the note", () => {
  const choice = (note: string) => suggestSort(odile, garrick, note)?.choice;
  it("reads parents with their role", () => {
    expect(choice("her father")).toEqual({ relation: "parent", parentRole: "father", label: null });
    expect(choice("Mum")).toMatchObject({ relation: "parent", parentRole: "mother" });
    expect(choice("a parent")).toMatchObject({ relation: "parent", parentRole: null });
  });
  it("reads children, spouses and former spouses", () => {
    expect(choice("her son")).toMatchObject({ relation: "child" });
    expect(choice("her first husband")).toMatchObject({ relation: "former_spouse" });
    expect(choice("the widow")).toMatchObject({ relation: "former_spouse" });
    expect(choice("her husband")).toMatchObject({ relation: "spouse" });
    expect(choice("married in spring")).toMatchObject({ relation: "spouse" });
  });
  it("reads siblings and keeps the word of a distant relative", () => {
    expect(choice("twin")).toMatchObject({ relation: "sibling" });
    expect(choice("Her uncle")).toEqual({ relation: "relative", parentRole: null, label: "uncle" });
  });
  it("matches whole words only", () => {
    expect(choice("grandchild of a neighbour")).toMatchObject({ relation: "relative", label: "grandchild" });
    expect(choice("sonorous voice")).toBeUndefined();
  });
  it("quotes the note, trimmed to 60 characters", () => {
    const note = `her father ${"x".repeat(80)}`;
    const reason = suggestSort(odile, garrick, note)?.reason ?? "";
    expect(reason).toBe(`note: “${note.slice(0, 60)}”`);
  });
});

describe("suggestSort from birth years", () => {
  it("makes the older one the parent when far apart", () => {
    const old = p("Aldous Thane", 1000);
    expect(suggestSort(odile, old, "")).toEqual({
      choice: { relation: "parent", parentRole: null, label: null },
      reason: "born 1033 and 1000: 33 years apart",
    });
    expect(suggestSort(old, odile, "")?.choice.relation).toBe("child");
  });
  it("reads a 15-year gap as a generation and 14 as not, in both directions", () => {
    const at = (year: number) => p("Someone Else", year);
    expect(suggestSort(p("A Thane", 1000), at(1015), "")?.choice.relation).toBe("child");
    expect(suggestSort(p("A Thane", 1000), at(985), "")?.choice.relation).toBe("parent");
    expect(suggestSort(p("A Thane", 1000), at(1014), "")).toBeNull();
  });
  it("calls same-name people siblings up to 10 years apart and not at 11", () => {
    expect(suggestSort(p("A Thane", 1000), p("B Thane", 1010), "")?.choice.relation).toBe("sibling");
    expect(suggestSort(p("A Thane", 1000), p("B Thane", 1011), "")).toBeNull();
  });
  it("does not make siblings of two people with no family name to share", () => {
    expect(suggestSort(p("", 1000), p("", 1002), "")).toBeNull();
  });
  it("suggests siblings for a small gap and a shared family name", () => {
    const tomas = p("Tomas Thane", 1038);
    expect(suggestSort(odile, tomas, "")).toMatchObject({
      choice: { relation: "sibling" },
      reason: "born 5 years apart, same family name",
    });
  });
  it("gives up otherwise", () => {
    expect(suggestSort(odile, garrick, "")).toBeNull();
    expect(suggestSort(odile, p("Nobody", null), "")).toBeNull();
    expect(suggestSort(odile, p("Ilse Thane", 1045), "")).toBeNull();
  });
  it("reads in-laws and step-kin as relatives, never as parents or siblings", () => {
    const a = { key: "npc:a", name: "A", bornYear: null, diedYear: null, dead: false, isPc: false } as const;
    const b = { key: "npc:b", name: "B", bornYear: null, diedYear: null, dead: false, isPc: false } as const;
    expect(suggestSort(a, b, "his father-in-law")?.choice).toEqual({ relation: "relative", parentRole: null, label: "father-in-law" });
    expect(suggestSort(a, b, "her step-mother")?.choice).toEqual({ relation: "relative", parentRole: null, label: "step-mother" });
    expect(suggestSort(a, b, "brother in law")?.choice.relation).toBe("relative");
  });
});
