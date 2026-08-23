import { describe, it, expect } from "vitest";
import { DM_SCREEN_SECTIONS } from "@/data/dmScreen";
import {
  DEFAULT_DM_SCREEN_TABLE_ID,
  DM_SCREEN_TABLE_OPTIONS,
  dmScreenTable,
  parseDmScreenCardSettings,
  resolveDmScreenTable,
} from "./dmScreenCard";

describe("dmScreenCard", () => {
  it("offers every table in every section, in data order", () => {
    const expected = DM_SCREEN_SECTIONS.flatMap((section) => section.tables.map((t) => t.id));
    expect(DM_SCREEN_TABLE_OPTIONS.map((option) => option.id)).toEqual(expected);
  });

  it("labels each option with its section, so 'Cover' is not ambiguous", () => {
    const cover = DM_SCREEN_TABLE_OPTIONS.find((option) => option.id === "cover");
    expect(cover).toEqual({ id: "cover", name: "Cover", section: "Combat" });
  });

  // The whole default path rests on this id existing; if a data edit renames
  // it, every unconfigured quick card silently falls back to nothing.
  it("has a default table that actually exists", () => {
    expect(dmScreenTable(DEFAULT_DM_SCREEN_TABLE_ID)).toBeDefined();
  });

  it("reads a stored table id", () => {
    expect(parseDmScreenCardSettings({ tableId: "cover" })).toEqual({ tableId: "cover" });
  });

  it.each([
    ["absent settings", undefined],
    ["a null blob", null],
    ["an array", ["cover"]],
    ["a blob with no tableId", { width: "cell" }],
    ["a non-string tableId", { tableId: 7 }],
    ["a table the data no longer has", { tableId: "gone-in-a-later-deploy" }],
  ])("falls back to the default for %s", (_label, raw) => {
    expect(parseDmScreenCardSettings(raw)).toEqual({ tableId: DEFAULT_DM_SCREEN_TABLE_ID });
  });

  it("resolves settings straight to a renderable table", () => {
    expect(resolveDmScreenTable({ tableId: "cover" })?.title).toBe("Cover");
    expect(resolveDmScreenTable(undefined)?.id).toBe(DEFAULT_DM_SCREEN_TABLE_ID);
  });

  it("gives no table for an id the data does not have", () => {
    expect(dmScreenTable("not-a-table")).toBeUndefined();
  });
});
