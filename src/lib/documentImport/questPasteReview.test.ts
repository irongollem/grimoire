import { describe, expect, it } from "vitest";
import { deriveImportDisplayName, selectPrimaryQuest, summarizeOtherKinds } from "./questPasteReview";
import type { ExtractionResult } from "@/types/documentImport.types";

function questEntity(ref: string, title: string) {
  return { ref, page: 1, confidence: "complete" as const, data: { title } };
}

function namedEntity(ref: string, name: string) {
  return { ref, page: 1, confidence: "complete" as const, data: { name } };
}

describe("selectPrimaryQuest", () => {
  it("returns null with no extras when the extraction has no quests", () => {
    expect(selectPrimaryQuest({})).toEqual({ entity: null, extraCount: 0, dropped: 0 });
    expect(selectPrimaryQuest({ quests: [] })).toEqual({ entity: null, extraCount: 0, dropped: 0 });
  });

  it("returns the first usable quest with no extras when there is exactly one", () => {
    const extracted: ExtractionResult = { quests: [questEntity("q1", "The Sunken Bell")] };
    const result = selectPrimaryQuest(extracted);
    expect(result.entity?.data.title).toBe("The Sunken Bell");
    expect(result.extraCount).toBe(0);
    expect(result.dropped).toBe(0);
  });

  it("takes the first quest and counts the rest as extras", () => {
    const extracted: ExtractionResult = {
      quests: [questEntity("q1", "The Sunken Bell"), questEntity("q2", "The Hollow King"), questEntity("q3", "Ashes of Varn")],
    };
    const result = selectPrimaryQuest(extracted);
    expect(result.entity?.data.title).toBe("The Sunken Bell");
    expect(result.extraCount).toBe(2);
  });

  it("drops a malformed quest before picking the primary one", () => {
    const extracted = { quests: [{ ref: "bad", data: {} }, questEntity("q1", "The Sunken Bell")] } as unknown as ExtractionResult;
    const result = selectPrimaryQuest(extracted);
    expect(result.entity?.data.title).toBe("The Sunken Bell");
    expect(result.dropped).toBe(1);
    expect(result.extraCount).toBe(0);
  });
});

describe("summarizeOtherKinds", () => {
  it("returns nothing when the extraction has only a quest", () => {
    expect(summarizeOtherKinds({ quests: [questEntity("q1", "The Sunken Bell")] })).toEqual([]);
  });

  it("excludes quests and omits kinds with zero usable entities", () => {
    const extracted: ExtractionResult = {
      quests: [questEntity("q1", "The Sunken Bell")],
      locations: [namedEntity("l1", "The Wailing Crypt")],
      spells: [],
    };
    const groups = summarizeOtherKinds(extracted);
    expect(groups.map((g) => g.kind)).toEqual(["locations"]);
    expect(groups[0]!.label).toBe("Locations");
    expect(groups[0]!.entities).toHaveLength(1);
  });

  it("orders groups by IMPORT_ENTITY_KINDS dependency order", () => {
    const extracted: ExtractionResult = {
      encounters: [namedEntity("e1", "Ambush")],
      factions: [namedEntity("f1", "The Watch")],
      npcs: [namedEntity("n1", "Reyes")],
    };
    const groups = summarizeOtherKinds(extracted);
    expect(groups.map((g) => g.kind)).toEqual(["factions", "npcs", "encounters"]);
  });

  it("drops malformed entities within a kind without dropping the whole group", () => {
    const extracted = {
      locations: [{ ref: "bad", data: {} }, namedEntity("l1", "The Wailing Crypt")],
    } as unknown as ExtractionResult;
    const groups = summarizeOtherKinds(extracted);
    expect(groups[0]!.entities).toHaveLength(1);
  });
});

describe("deriveImportDisplayName", () => {
  it("falls back to a generic name for empty or whitespace-only text", () => {
    expect(deriveImportDisplayName("")).toBe("Pasted quest");
    expect(deriveImportDisplayName("   \n  \n")).toBe("Pasted quest");
  });

  it("uses the first non-blank line", () => {
    expect(deriveImportDisplayName("\n\nThe Sunken Bell\nSome more text.")).toBe("The Sunken Bell");
  });

  it("strips a leading markdown heading marker", () => {
    expect(deriveImportDisplayName("## The Sunken Bell")).toBe("The Sunken Bell");
  });

  it("truncates a long first line to 60 characters", () => {
    const longLine = "A".repeat(120);
    const result = deriveImportDisplayName(longLine);
    expect(result).toHaveLength(60);
  });
});
