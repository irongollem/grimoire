import { describe, expect, it } from "vitest";
import { spokenLines } from "./voiceLines";
import type { StoryItem } from "./soloTypes";

describe("spokenLines", () => {
  // Bug caught: the voice reading a deed, the narration or the player's own words aloud, or changing the order.
  it("keeps only what characters said, in the order it was said", () => {
    const items: StoryItem[] = [
      { id: "1", kind: "player", mode: "say", text: "Who are you?" },
      { id: "2", kind: "acted", speaker: { id: "n1", name: "Honeycomb" }, text: "Turns the keys over." },
      { id: "3", kind: "spoken", speaker: { id: "n1", name: "Honeycomb" }, text: "Honeycomb. Apprentice, once." },
      { id: "4", kind: "narration", text: "Rain starts." },
      { id: "5", kind: "spoken", speaker: { id: null, name: "A sweeper" }, text: "Mind your feet." },
      { id: "6", kind: "margin", text: "Looked something up", count: 1 },
    ];
    expect(spokenLines(items)).toEqual([
      { speakerId: "n1", speakerName: "Honeycomb", text: "Honeycomb. Apprentice, once." },
      { speakerId: null, speakerName: "A sweeper", text: "Mind your feet." },
    ]);
  });
});
