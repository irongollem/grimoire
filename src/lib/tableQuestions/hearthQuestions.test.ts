import { describe, expect, it } from "vitest";
import type { TableQuestion, TableQuestionAnswer } from "@/types/tableQuestion.types";
import { questionsToShow } from "./hearthQuestions";

const NOW = Date.parse("2026-11-16T12:00:00Z");
const q = (id: string, over: Partial<TableQuestion> = {}): TableQuestion =>
  ({ id, mode: "pick", closed_at: null, outcome_option_id: null, created_at: `2026-11-16T0${id}:00:00Z`, ...over }) as TableQuestion;
const ans = (question_id: string, user_id = "me"): TableQuestionAnswer => ({ question_id, user_id }) as TableQuestionAnswer;
const ids = (list: TableQuestion[]) => list.map((x) => x.id);

describe("questionsToShow", () => {
  it("shows open questions newest first, answered or not", () => {
    expect(ids(questionsToShow([q("1"), q("2")], [ans("1")], "me", NOW))).toEqual(["2", "1"]);
  });

  it("drops a closed question the player never answered, unless it is a vote with an outcome", () => {
    const closed = "2026-11-16T10:00:00Z";
    const list = [
      q("1", { closed_at: closed }),
      q("2", { closed_at: closed, mode: "vote", outcome_option_id: "o" }),
      q("3", { closed_at: closed, mode: "vote" }),
    ];
    expect(ids(questionsToShow(list, [], "me", NOW))).toEqual(["2"]);
  });

  it("keeps a closed question only for the player who answered it, not for someone else's answer", () => {
    const list = [q("1", { closed_at: "2026-11-16T10:00:00Z" })];
    expect(ids(questionsToShow(list, [ans("1")], "me", NOW))).toEqual(["1"]);
    expect(ids(questionsToShow(list, [ans("1", "other")], "me", NOW))).toEqual([]);
  });

  it("drops a question closed more than a day ago even when answered", () => {
    const list = [q("1", { closed_at: "2026-11-15T11:00:00Z" })];
    expect(questionsToShow(list, [ans("1")], "me", NOW)).toEqual([]);
  });
});
