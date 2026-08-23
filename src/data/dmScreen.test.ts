import { describe, expect, it } from "vitest";
import { DM_SCREEN_SECTIONS } from "./dmScreen";

describe("DM_SCREEN_SECTIONS", () => {
  it("has unique section ids", () => {
    const ids = DM_SCREEN_SECTIONS.map((section) => section.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has unique table ids across all sections", () => {
    const tableIds = DM_SCREEN_SECTIONS.flatMap((section) => section.tables.map((table) => table.id));
    expect(new Set(tableIds).size).toBe(tableIds.length);
  });

  it("gives every row the same length as its table's columns", () => {
    for (const section of DM_SCREEN_SECTIONS) {
      for (const table of section.tables) {
        for (const [rowIndex, row] of table.rows.entries()) {
          expect(
            row.length,
            `section "${section.id}" table "${table.id}" row ${rowIndex} has ${row.length} cells, expected ${table.columns.length}`,
          ).toBe(table.columns.length);
        }
      }
    }
  });

  it("gives every table at least one row and at least two columns", () => {
    for (const section of DM_SCREEN_SECTIONS) {
      for (const table of section.tables) {
        expect(table.rows.length, `section "${section.id}" table "${table.id}" has no rows`).toBeGreaterThanOrEqual(1);
        expect(
          table.columns.length,
          `section "${section.id}" table "${table.id}" has fewer than 2 columns`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("gives every section and table a non-empty title", () => {
    for (const section of DM_SCREEN_SECTIONS) {
      expect(section.title.trim().length, `section "${section.id}" has an empty title`).toBeGreaterThan(0);
      for (const table of section.tables) {
        expect(
          table.title.trim().length,
          `section "${section.id}" table "${table.id}" has an empty title`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
