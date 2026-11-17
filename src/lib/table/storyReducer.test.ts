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
      "The heir holds the keys.",
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

describe("hit points changed outside a fight", () => {
  // Bug caught: a loss written with a plus, so a fall read as healing in the story.
  it("writes what did it, the amount with its sign, and where the character stands", () => {
    const healed = play([{ type: "hit_points", change: { heals: true, why: "Potion of Healing", by: 7, hp: 22, maxHp: 58 } }]);
    expect(healed.at(-1)).toMatchObject({ kind: "margin", text: "Potion of Healing: +7 hit points · 22 of 58" });
    const hurt = play([{ type: "hit_points", change: { heals: false, why: "The fall", by: 6, hp: 16, maxHp: 58 } }]);
    expect(hurt.at(-1)).toMatchObject({ text: "The fall: −6 hit points · 16 of 58" });
  });
});

describe("words offered to a voice", () => {
  // Bug caught: the narrator's key lost (never voiced), or put on the wrong paragraph; a second stretch replacing the first.
  it("puts each narrator key on the narration being written, in order", () => {
    const story = play([
      { type: "text", delta: "Rain starts." },
      { type: "voice", role: "narrator", text: "Rain starts.", key: "k1" },
      { type: "text", delta: " The lamps gutter." },
      { type: "voice", role: "narrator", text: "The lamps gutter.", key: "k2" },
    ]);
    expect(story.at(-1)).toMatchObject({ kind: "narration", voices: [{ text: "Rain starts.", key: "k1" }, { text: "The lamps gutter.", key: "k2" }] });
  });

  // Bug caught: the player's key put on a deed, which would then be read aloud as speech.
  it("puts the player's key on the line they said, and never on a deed", () => {
    const said = play([{ type: "voice", role: "player", text: "Hello.", key: "k" }], [playerItem("say", "Hello.", "p1")]);
    expect(said[0]).toMatchObject({ voice: { key: "k" } });
    const done = play([{ type: "voice", role: "player", text: "I open it.", key: "k" }], [playerItem("do", "I open it.", "p2")]);
    expect(done[0]).not.toHaveProperty("voice");
  });
});
