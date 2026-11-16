import { describe, expect, it } from "vitest";
import type { TableQuestion, TableQuestionAnswer, TableQuestionOption } from "@/types/tableQuestion.types";
import { answerOf, isWaitingOn, optionById, takenByOthers, tally } from "./answers";

const opt = (id: string): TableQuestionOption => ({
  id, label: id, blurb: null, image_url: null, focal: null, ref: null, min: 1, max: 1,
});
const question = (over: Partial<TableQuestion> = {}): TableQuestion => ({
  id: "q", campaign_id: "c", user_id: "dm", roll_table_id: null, prompt: "p", mode: "pick", dice: null,
  exclusive: false, hidden: false, gift: false, options: [opt("a"), opt("b")], closed_at: null, outcome_option_id: null,
  created_at: "", updated_at: "", ...over,
});
const answer = (user: string, option: string | null): TableQuestionAnswer => ({
  id: `ans-${user}`, question_id: "q", campaign_id: "c", user_id: user, party_member_id: null,
  option_id: option, rolled: null, companion_id: null, inventory_item_id: null, created_at: "", updated_at: "",
});

describe("answerOf", () => {
  it("finds the caller's own answer, not another player's", () => {
    expect(answerOf([answer("u1", "a"), answer("u2", "b")], "u2")?.option_id).toBe("b");
    expect(answerOf([answer("u1", "a")], "u2")).toBeNull();
  });
});

describe("isWaitingOn", () => {
  it("is false once the question is closed, so a closed question never nags", () => {
    expect(isWaitingOn(question({ closed_at: "2026-01-01" }), [], "u1")).toBe(false);
  });
  it("is false once the user has answered, true while they have not", () => {
    expect(isWaitingOn(question(), [answer("u1", "a")], "u1")).toBe(false);
    expect(isWaitingOn(question(), [answer("u2", "a")], "u1")).toBe(true);
  });
});

describe("takenByOthers", () => {
  it("lists what others hold on an exclusive pick but not the caller's own choice", () => {
    const taken = takenByOthers(question({ exclusive: true }), [answer("u1", "a"), answer("u2", "b")], "u1");
    expect([...taken]).toEqual(["b"]);
  });
  it("is empty when the pick is not exclusive, so shared picks are never greyed out", () => {
    expect(takenByOthers(question(), [answer("u2", "b")], "u1").size).toBe(0);
  });
  it("is empty for a vote, where many may choose the same option", () => {
    expect(takenByOthers(question({ mode: "vote" }), [answer("u2", "b")], "u1").size).toBe(0);
  });
});

describe("tally", () => {
  it("groups answers per option in option order and keeps a roll in a gap apart instead of dropping it", () => {
    const { rows, unmatched } = tally(question(), [answer("u1", "b"), answer("u2", "b"), answer("u3", null)]);
    expect(rows.map((r) => [r.option.id, r.answers.length])).toEqual([["a", 0], ["b", 2]]);
    expect(unmatched.map((a) => a.user_id)).toEqual(["u3"]);
  });
});

describe("optionById", () => {
  it("returns null for no id and for an id the question does not have", () => {
    expect(optionById(question(), null)).toBeNull();
    expect(optionById(question(), "zzz")).toBeNull();
    expect(optionById(question(), "a")?.id).toBe("a");
  });
});
