import { describe, expect, it } from "vitest";
import { parseAskEvent, parseAskProposal } from "./parseAskEvent";

const proposal = { proposalId: "p1", generator: "npc", concept: "a baker", inputs: { name: "Mara" } };

describe("parseAskEvent: error", () => {
  // Bug caught: a withheld answer's flag dropped in parsing, leaving the code it had streamed on screen.
  it("carries `withheld` only when it is literally true", () => {
    expect(parseAskEvent({ type: "error", message: "No.", withheld: true })).toEqual({ type: "error", message: "No.", withheld: true });
    expect(parseAskEvent({ type: "error", message: "No.", withheld: "yes" })).toEqual({ type: "error", message: "No." });
    expect(parseAskEvent({ type: "error", message: "No." })).toEqual({ type: "error", message: "No." });
  });
});

describe("parseAskEvent", () => {
  // Bug caught: an unknown or newer event type reaching the panel as if it were trusted.
  it("skips an event type it does not know", () => {
    expect(parseAskEvent({ type: "levitate" })).toBeNull();
    expect(parseAskEvent("text")).toBeNull();
    expect(parseAskEvent(null)).toBeNull();
  });

  // Bug caught: a proposal for a generator this build cannot quote becoming a card that can never run.
  it("skips a proposal for an unknown generator", () => {
    expect(parseAskEvent({ type: "propose", proposal: { ...proposal, generator: "nuke" } })).toBeNull();
    expect(parseAskEvent({ type: "propose", proposal })).toEqual({ type: "propose", proposal });
  });

  // Bug caught: a proposal with no id (so no run-once key) or with inputs that are not an object being quoted.
  it("skips a proposal missing its id or with non-object inputs", () => {
    expect(parseAskProposal({ ...proposal, proposalId: "" })).toBeNull();
    expect(parseAskProposal({ ...proposal, inputs: [1] })).toBeNull();
    expect(parseAskProposal({ ...proposal, target: { type: "npc", id: "" , name: "x" } })).toBeNull();
  });

  // Bug caught: one record reference of a kind this build cannot link killing the whole "Show what I read" list.
  it("drops a record ref it cannot draw and keeps the rest", () => {
    const event = parseAskEvent({
      type: "read",
      records: [{ type: "npc", id: "n1", name: "Mara" }, { type: "dragon", id: "d", name: "x" }, { type: "npc", id: 4, name: "y" }],
    });
    expect(event).toEqual({ type: "read", records: [{ type: "npc", id: "n1", name: "Mara" }] });
  });

  // Bug caught: chips with no reply text, which would send an empty message when pressed.
  it("skips a question whose chip has no reply", () => {
    expect(parseAskEvent({ type: "ask", question: "Which?", choices: [{ label: "A", reply: "" }] })).toBeNull();
    expect(parseAskEvent({ type: "ask", question: "Which?", choices: [{ label: "A", reply: "a", note: "2 credits" }] })).toEqual({
      type: "ask",
      question: "Which?",
      choices: [{ label: "A", reply: "a", note: "2 credits" }],
    });
  });

  // Bug caught: an idea line with no canon flag, which cannot be tagged Canon or New idea.
  it("skips ideas with an untagged line", () => {
    expect(parseAskEvent({ type: "ideas", ideas: [{ title: "T", lines: [{ text: "x", refs: [] }] }] })).toBeNull();
    const ok = parseAskEvent({ type: "ideas", ideas: [{ title: "T", lines: [{ canon: true, text: "x" }], handoff: { generator: "npc", concept: "c", inputs: {} } }] });
    expect(ok).toEqual({ type: "ideas", ideas: [{ title: "T", lines: [{ canon: true, text: "x", refs: [] }], handoff: { generator: "npc", concept: "c", inputs: {} } }] });
  });

  // Bug caught: a done event with a negative or fractional "free left" corrupting the counter line.
  it("skips a done event with an impossible count", () => {
    const base = { type: "done", end: "done", routed: false, free: true, credits: 0, freeLeft: 4 };
    expect(parseAskEvent(base)).toEqual(base);
    expect(parseAskEvent({ ...base, freeLeft: -1 })).toBeNull();
    expect(parseAskEvent({ ...base, freeLeft: 1.5 })).toBeNull();
    expect(parseAskEvent({ ...base, end: "exploded" })).toBeNull();
  });
});
