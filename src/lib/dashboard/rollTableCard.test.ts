import { describe, it, expect } from "vitest";
import type { RollTable } from "@/types/rollTable.types";
import { parseRollTableCardSettings, resolveRollTable } from "./rollTableCard";

const table = (id: string, name: string): RollTable => ({
  id,
  user_id: "dm",
  campaign_id: "c1",
  name,
  description: null,
  dice: "1d8",
  entries: [],
  tags: [],
  notes: null,
  created_at: "2026-08-24T00:00:00Z",
  updated_at: "2026-08-24T00:00:00Z",
});

const RUMORS = table("t-rumors", "Tavern Rumors");
const WANDERING = table("t-wandering", "Wandering Monsters");

describe("parseRollTableCardSettings", () => {
  it("reads a stored table id", () => {
    expect(parseRollTableCardSettings({ tableId: "t-rumors" })).toEqual({ tableId: "t-rumors" });
  });

  it.each([
    ["absent settings", undefined],
    ["a null blob", null],
    ["an array", ["t-rumors"]],
    ["a blob with no tableId", { width: "cell" }],
    ["a non-string tableId", { tableId: 7 }],
    // "" is what EntityCombobox's clear control writes; it is not a choice.
    ["an empty tableId", { tableId: "" }],
  ])("reads %s as unconfigured", (_label, raw) => {
    expect(parseRollTableCardSettings(raw)).toEqual({});
  });
});

describe("resolveRollTable", () => {
  it("rolls the configured table", () => {
    const result = resolveRollTable({ tableId: "t-wandering" }, [RUMORS, WANDERING]);
    expect(result).toEqual({ state: "ready", table: WANDERING });
  });

  // So a freshly added card does something before the DM opens the gear.
  it("falls to the first table when unconfigured", () => {
    expect(resolveRollTable(undefined, [RUMORS, WANDERING])).toEqual({
      state: "ready",
      table: RUMORS,
    });
  });

  it("says so when the campaign has no roll tables", () => {
    expect(resolveRollTable(undefined, [])).toEqual({ state: "none" });
  });

  // The case that must never silently substitute: a card pinned to a table
  // the DM deleted, or a campaign switch. Rolling a different table while
  // looking unchanged is worse than saying nothing.
  it("reports a configured table the campaign does not have, and does not substitute", () => {
    expect(resolveRollTable({ tableId: "t-gone" }, [RUMORS, WANDERING])).toEqual({
      state: "missing",
      tableId: "t-gone",
    });
  });

  it("reports missing even when the campaign has no tables at all", () => {
    expect(resolveRollTable({ tableId: "t-gone" }, [])).toEqual({
      state: "missing",
      tableId: "t-gone",
    });
  });
});
