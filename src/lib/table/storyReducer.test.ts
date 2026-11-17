import { describe, expect, it } from "vitest";
import { applyTableEvent, playerItem } from "./storyReducer";
import type { StoryItem, TableEvent } from "./soloTypes";

function play(events: TableEvent[], from: StoryItem[] = []): StoryItem[] {
  return events.reduce(applyTableEvent, from);
}

const line = (kind: "spoken" | "acted", text: string): TableEvent => ({
  type: "line",
  line: { kind, speaker: { id: "n1", name: "Honeycomb" }, text },
});

describe("applyTableEvent", () => {
  // Bug caught: every delta becoming its own paragraph, so streamed words render one per line.
  it("joins narration deltas into one narration item", () => {
    const items = play([
      { type: "text", delta: "The lane " },
      { type: "text", delta: "smells of " },
      { type: "text", delta: "rain." },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "narration", text: "The lane smells of rain." });
  });

  // Bug caught: narration after a character's line appended to the narration BEFORE it, reordering the story.
  it("starts a new narration after a line", () => {
    const items = play([{ type: "text", delta: "Before." }, line("spoken", "Hello."), { type: "text", delta: "After." }]);
    expect(items.map((i) => i.kind)).toEqual(["narration", "spoken", "narration"]);
    expect(items[2]).toMatchObject({ text: "After." });
  });

  // Bug caught: a tool name reaching the page raw, or the result of a lookup leaking into the margin.
  it("shows a lookup as a quiet line naming the kind, and nothing for the tools whose effect is its own event", () => {
    const items = play([
      { type: "tool_start", name: "search" },
      { type: "tool_end", name: "search", isError: false },
      { type: "tool_start", name: "roll" },
      { type: "tool_start", name: "speak" },
      { type: "tool_start", name: "quest_route" },
    ]);
    expect(items.map((i) => (i.kind === "margin" ? i.text : i.kind))).toEqual(["Looked something up"]);
  });

  // Bug caught: a hidden roll betrayed by a "Rolled" line, when the server sends nothing for it on purpose.
  it("draws nothing for the roll tool itself, and the Dungeon Master's open roll where it happened", () => {
    const dm = { label: "Warmth", dice: "1d20", faces: [20], dropped: [], modifier: 0, total: 20 };
    const hidden = play([{ type: "tool_start", name: "roll" }, { type: "tool_end", name: "roll", isError: false }]);
    expect(hidden).toEqual([]);
    const shown = play([{ type: "tool_start", name: "roll" }, { type: "dm_roll", roll: dm }, { type: "text", delta: "She smiles." }]);
    expect(shown.map((i) => i.kind)).toEqual(["dmRoll", "narration"]);
  });

  // Bug caught: four searches in a row filling the page with four identical lines.
  it("folds a run of the same quiet line into one with a count", () => {
    const items = play([
      { type: "tool_start", name: "search" },
      { type: "tool_start", name: "get" },
      { type: "tool_start", name: "list" },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "margin", text: "Looked something up", count: 3 });
  });

  // Bug caught: a deed drawn as speech (or the reverse), which is the one distinction the page exists to make.
  it("keeps a spoken line and an acted line as their own kinds, in order", () => {
    const items = play([line("acted", "Holds out the keys."), line("spoken", "Come on, then.")]);
    expect(items.map((i) => i.kind)).toEqual(["acted", "spoken"]);
  });

  // Bug caught: arriving somewhere or filing a fact being silent, so the player never learns the party moved.
  it("notes where the party is and what went on record", () => {
    const items = play([
      { type: "scene", scene: { id: "l1", name: "The Locked Workshop" } },
      { type: "fact", fact: { id: "f1", body: "The heir holds the keys." } },
    ]);
    expect(items.map((i) => (i.kind === "margin" ? i.text : i.kind))).toEqual([
      "The party is at The Locked Workshop",
      "On record: The heir holds the keys.",
    ]);
  });

  // Bug caught: the reducer mutating the story it was given, so a Vue shallow ref never sees the change.
  it("returns a new list and leaves the old one alone", () => {
    const before = [playerItem("say", "Hello")];
    const after = applyTableEvent(before, { type: "text", delta: "x" });
    expect(after).not.toBe(before);
    expect(before).toHaveLength(1);
  });

  // Bug caught: session, done and error events adding story items of their own.
  it("draws nothing for the events that carry no story", () => {
    const before = [playerItem("do", "I wait.")];
    expect(play([{ type: "session", sessionId: "s1" }, { type: "done", end: "end_turn", credits: 1, tokens: 9 }], before)).toEqual(before);
  });
});

describe("applyTableEvent for a roll", () => {
  const rolled: TableEvent = { type: "rolled", roll: { label: "Wisdom (Perception)", faces: [13], kept: 13, bonus: 4, total: 17, mode: "normal", atTable: false } };

  // Bug caught: the roll drawn after the player's words, so a reload (which draws it first) reorders the story.
  it("puts the roll before the player's own words of the same turn", () => {
    const before = [playerItem("do", "I look.", "p0"), playerItem("say", "Hello", "p1")];
    const items = applyTableEvent(before, rolled, 1);
    expect(items.map((i) => i.kind)).toEqual(["player", "roll", "player"]);
  });

  it("appends a roll sent without words", () => {
    expect(applyTableEvent([{ id: "n", kind: "narration", text: "x" }], rolled).map((i) => i.kind)).toEqual(["narration", "roll"]);
  });

  // Bug caught: narration streaming after a roll joining the paragraph before it.
  it("starts a new narration after the roll", () => {
    const items = play([rolled, { type: "text", delta: "You see it." }]);
    expect(items.map((i) => i.kind)).toEqual(["roll", "narration"]);
  });
});
