import { describe, expect, it } from "vitest";
import { RETIRED_QUEST_COLUMNS, stripRetiredQuestColumns } from "./retiredQuestColumns";
import type { QuestInsert } from "@/types/quest.types";

/**
 * The bug this module exists for was not a wrong value — it was two lists.
 * `useCampaignBackup` stripped twelve retired columns and `useWorldBundle`
 * stripped two, so a `.grimoire` bundle holding a quest with reward columns
 * failed its entire insert on `column does not exist`. Both read their rows as
 * `Record<string, unknown>`, so no compiler could have noticed.
 */
describe("stripRetiredQuestColumns", () => {
  it("removes every retired column", () => {
    const row = Object.fromEntries(RETIRED_QUEST_COLUMNS.map((c) => [c, "legacy"]));
    expect(Object.keys(stripRetiredQuestColumns(row))).toEqual([]);
  });

  it("keeps everything else, including falsy values", () => {
    const kept = stripRetiredQuestColumns({
      id: "q1",
      title: "The lost sword",
      summary: null,
      status: "active",
      started_at: 0,
      player_visible_to: [],
      description: "retired",
    });
    expect(kept).toEqual({
      id: "q1",
      title: "The lost sword",
      summary: null,
      status: "active",
      started_at: 0,
      player_visible_to: [],
    });
  });

  it("does not modify the row it is given", () => {
    const row = { id: "q1", description: "retired" };
    stripRetiredQuestColumns(row);
    expect(row).toEqual({ id: "q1", description: "retired" });
  });

  it("returns a row unchanged when it carries nothing retired", () => {
    const row = { id: "q1", title: "Modern" };
    expect(stripRetiredQuestColumns(row)).toEqual(row);
  });

  /**
   * The guard that matters, and it deliberately is **not** a runtime
   * assertion. A first attempt wrote `c in ({} as Required<QuestInsert>)`,
   * which reads the keys of an empty object — always false, so the test could
   * never fail. Types are erased at runtime; asking one a question with `in`
   * gets an answer about `{}`.
   *
   * The type-level form below is checked by `vue-tsc` instead: if a column on
   * the retired list ever comes back to `quests`, `QuestInsert` gains the key,
   * `Extract` stops being `never`, and this stops compiling — because a column
   * that exists must not be silently stripped out of every import.
   *
   * The opposite drift — a migration retiring a *new* column that nobody adds
   * here — is the one no check can see, which is why both importers were made
   * to read this single list rather than keep their own.
   */
  it("names only columns the current QuestInsert no longer has", () => {
    type StillPresent = Extract<(typeof RETIRED_QUEST_COLUMNS)[number], keyof QuestInsert>;
    const noneStillPresent: StillPresent extends never ? true : false = true;
    expect(noneStillPresent).toBe(true);
  });
});
