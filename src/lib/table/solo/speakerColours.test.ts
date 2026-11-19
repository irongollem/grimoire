import { describe, expect, it } from "vitest";
import { assignSpeakerColours, speakerKey, VOICE_PIGMENTS } from "./speakerColours";
import type { StoryItem } from "./soloTypes";
import { applyTableEvent } from "./storyReducer";
import { storyFromTurns } from "./storyFromTurns";

const said = (id: string | null, name: string, n: number): StoryItem => ({ id: `i${n}`, kind: "spoken", speaker: { id, name }, text: "x" });

describe("assignSpeakerColours", () => {
  // Bug caught: colours handed out by arrival order of events in this session (or by a counter kept while playing)
  // rather than by the story, so a reload paints the same character differently from the live page.
  it("gives a character the colour on reload that they had live", () => {
    const lines = [
      { kind: "spoken" as const, speaker: { id: "n1", name: "Honeycomb" }, text: "a" },
      { kind: "spoken" as const, speaker: { id: "n2", name: "The sweeper" }, text: "b" },
      { kind: "acted" as const, speaker: { id: "n1", name: "Honeycomb" }, text: "c" },
    ];
    const live = assignSpeakerColours(lines.map((line) => ({ type: "line" as const, line })).reduce(applyTableEvent, [] as StoryItem[]));
    const reloaded = assignSpeakerColours(storyFromTurns([{ seq: 1, role: "user", blocks: [{ type: "tool_result", lines }] }]));
    expect([...reloaded]).toEqual([...live]);
    expect(live.get("id:n1")).toBe(VOICE_PIGMENTS[0]);
    expect(live.get("id:n2")).toBe(VOICE_PIGMENTS[1]);
  });

  // Bug caught: a deed and speech from one character taking two colours.
  it("gives one character one colour for the whole story", () => {
    const colours = assignSpeakerColours([said("n1", "Honeycomb", 1), { id: "i2", kind: "acted", speaker: { id: "n1", name: "Honeycomb" }, text: "y" }, said("n1", "Honeycomb", 3)]);
    expect(colours.size).toBe(1);
  });

  // Bug caught: two speakers with no record, told apart by nothing, sharing a colour; or the same name in a different case splitting.
  it("tells apart characters with no record by name, ignoring case", () => {
    const colours = assignSpeakerColours([said(null, "The Sweeper", 1), said(null, "Guard", 2), said(null, "the sweeper", 3)]);
    expect(colours.size).toBe(2);
    expect(speakerKey({ id: null, name: " The Sweeper " })).toBe(speakerKey({ id: null, name: "the sweeper" }));
  });

  // Bug caught: running out of pigments and giving the sixth speaker nothing (undefined), which draws no colour at all.
  it("starts the order again after the fifth speaker", () => {
    const colours = assignSpeakerColours(Array.from({ length: 6 }, (_, n) => said(`n${n}`, `Speaker ${n}`, n)));
    expect(colours.get("id:n5")).toBe(VOICE_PIGMENTS[0]);
  });
});
