import { describe, expect, it } from "vitest";
import {
  hasSourcedCreate,
  normalizeSourceTitle,
  pickDefaultSourceTitle,
  rankSourceOptions,
  type SourceTitleRow,
} from "./sourceTitle";
import type { ImportDecision } from "./entityMatching";
import type { ImportEntityKind } from "@/types/documentImport.types";

describe("normalizeSourceTitle", () => {
  it("trims a title", () => {
    expect(normalizeSourceTitle("  Icewind Dale  ")).toBe("Icewind Dale");
  });

  it("treats null/undefined/whitespace-only as no title", () => {
    expect(normalizeSourceTitle(null)).toBeNull();
    expect(normalizeSourceTitle(undefined)).toBeNull();
    expect(normalizeSourceTitle("   ")).toBeNull();
    expect(normalizeSourceTitle("")).toBeNull();
  });
});

describe("rankSourceOptions", () => {
  it("counts and ranks distinct titles, most-used first", () => {
    const rows: SourceTitleRow[] = [
      { source: "Icewind Dale", campaignId: "c1" },
      { source: "Icewind Dale", campaignId: "c1" },
      { source: "Curse of Strahd", campaignId: "c1" },
    ];
    expect(rankSourceOptions(rows)).toEqual([
      { value: "Icewind Dale", count: 2 },
      { value: "Curse of Strahd", count: 1 },
    ]);
  });

  it("breaks a tie alphabetically, for a stable order", () => {
    const rows: SourceTitleRow[] = [
      { source: "Curse of Strahd", campaignId: "c1" },
      { source: "Icewind Dale", campaignId: "c1" },
    ];
    expect(rankSourceOptions(rows).map((o) => o.value)).toEqual(["Curse of Strahd", "Icewind Dale"]);
  });

  it("ignores a blank/whitespace-only source", () => {
    const rows: SourceTitleRow[] = [{ source: "   ", campaignId: "c1" }];
    expect(rankSourceOptions(rows)).toEqual([]);
  });

  it("returns an empty list for no rows", () => {
    expect(rankSourceOptions([])).toEqual([]);
  });
});

describe("pickDefaultSourceTitle", () => {
  it("prefers the most-used title within the importing campaign", () => {
    const rows: SourceTitleRow[] = [
      { source: "Curse of Strahd", campaignId: "other-campaign" },
      { source: "Curse of Strahd", campaignId: "other-campaign" },
      { source: "Icewind Dale", campaignId: "this-campaign" },
    ];
    expect(pickDefaultSourceTitle(rows, "this-campaign")).toBe("Icewind Dale");
  });

  it("falls back to the most-used title overall when the campaign has none", () => {
    const rows: SourceTitleRow[] = [
      { source: "Curse of Strahd", campaignId: "other-campaign" },
      { source: "Curse of Strahd", campaignId: null }, // a DM global row
      { source: "Icewind Dale", campaignId: "other-campaign" },
    ];
    expect(pickDefaultSourceTitle(rows, "this-campaign")).toBe("Curse of Strahd");
  });

  it("falls back to null when the DM has never named a source before", () => {
    expect(pickDefaultSourceTitle([], "this-campaign")).toBeNull();
  });
});

describe("hasSourcedCreate", () => {
  const CREATE: ImportDecision = { action: "create" };
  const LINK: ImportDecision = {
    action: "link",
    candidate: { targetId: "x", source: "campaign", name: "X", matchKind: "exact", detail: null, distance: null },
  };
  const GENERATE: ImportDecision = { action: "generate" };
  const IGNORE: ImportDecision = { action: "ignore" };

  it("is true when a monster/item/spell is decided create", () => {
    const decisionsByKind: Partial<Record<ImportEntityKind, ReadonlyMap<string, ImportDecision>>> = {
      monsters: new Map([["m1", CREATE]]),
    };
    expect(hasSourcedCreate(decisionsByKind)).toBe(true);
  });

  it("is false when every monster/item/spell decision is link/generate/ignore", () => {
    const decisionsByKind: Partial<Record<ImportEntityKind, ReadonlyMap<string, ImportDecision>>> = {
      monsters: new Map<string, ImportDecision>([["m1", LINK], ["m2", GENERATE]]),
      items: new Map([["i1", IGNORE]]),
    };
    expect(hasSourcedCreate(decisionsByKind)).toBe(false);
  });

  it("is false when no decisions exist for any sourced kind", () => {
    const decisionsByKind: Partial<Record<ImportEntityKind, ReadonlyMap<string, ImportDecision>>> = {
      npcs: new Map([["n1", CREATE]]),
    };
    expect(hasSourcedCreate(decisionsByKind)).toBe(false);
  });

  it("is true when only items or only spells has a create, independent of the other two", () => {
    expect(hasSourcedCreate({ items: new Map([["i1", CREATE]]) })).toBe(true);
    expect(hasSourcedCreate({ spells: new Map([["s1", CREATE]]) })).toBe(true);
  });
});
