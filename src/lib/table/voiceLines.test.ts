import { describe, expect, it } from "vitest";
import { freshLines, NARRATOR_NAME, replayLines } from "./voiceLines";
import type { StoryItem } from "./soloTypes";

const ROSIE = { id: "m1", name: "Rosie" };
const ALL = { narrator: true, characters: true, player: true };
const items: StoryItem[] = [
  { id: "1", kind: "player", mode: "say", text: "Who are you?", voice: { key: "k1" } },
  { id: "2", kind: "acted", speaker: { id: "n1", name: "Honeycomb" }, text: "Turns the keys over.", voice: { key: "k2" } },
  { id: "3", kind: "spoken", speaker: { id: "n1", name: "Honeycomb" }, text: "Honeycomb. Apprentice, once.", voice: { how: "wary", key: "k3" } },
  { id: "4", kind: "narration", text: "Rain starts. The lamps gutter.", voices: [{ text: "Rain starts.", key: "k4a" }, { text: "The lamps gutter.", key: "k4b" }] },
  { id: "5", kind: "player", mode: "do", text: "I open the door." },
  { id: "6", kind: "player", mode: "ask", text: "What is here?" },
  { id: "7", kind: "margin", text: "Looked something up", count: 1 },
];

describe("freshLines", () => {
  // Bug caught: the player's own deed, a question to the Dungeon Master or a margin note read aloud; a character's
  // deed read in the character's voice instead of the narrator's; or the order changed.
  it("reads what was said, done and narrated, in order, each under its own role", () => {
    expect(freshLines(items, ALL, ROSIE)).toEqual([
      { role: "player", speakerId: "m1", speakerName: "Rosie", text: "Who are you?", how: null, key: "k1" },
      { role: "narrator", speakerId: null, speakerName: NARRATOR_NAME, text: "Turns the keys over.", how: null, key: "k2" },
      { role: "character", speakerId: "n1", speakerName: "Honeycomb", text: "Honeycomb. Apprentice, once.", how: "wary", key: "k3" },
      { role: "narrator", speakerId: null, speakerName: NARRATOR_NAME, text: "Rain starts.", how: null, key: "k4a" },
      { role: "narrator", speakerId: null, speakerName: NARRATOR_NAME, text: "The lamps gutter.", how: null, key: "k4b" },
    ]);
  });

  // Bug caught: one switch turning on everything (the narrator read aloud when only the characters were asked for).
  it("reads only what is switched on", () => {
    expect(freshLines(items, { narrator: false, characters: true, player: false }, ROSIE).map((l) => l.role)).toEqual(["character"]);
    expect(freshLines(items, { narrator: true, characters: false, player: false }, ROSIE).map((l) => l.role)).toEqual(["narrator", "narrator", "narrator"]);
  });

  // Bug caught: a reopened sitting read aloud from the top.
  it("leaves out what came without a key, as everything in a reopened sitting does", () => {
    const stored: StoryItem[] = [
      { id: "1", kind: "spoken", speaker: { id: "n1", name: "Honeycomb" }, text: "Hello." },
      { id: "2", kind: "narration", text: "Rain starts." },
    ];
    expect(freshLines(stored, ALL, ROSIE)).toEqual([]);
  });
});

describe("replayLines", () => {
  // Bug caught: a stored line having nothing to ask the kept clips with, so a reopened sitting stays silent.
  it("asks for a stored line and a stored narration without a key, by their words", () => {
    expect(replayLines({ id: "1", kind: "spoken", speaker: { id: "n1", name: "Honeycomb" }, text: "Hello." }, ROSIE)).toEqual([
      { role: "character", speakerId: "n1", speakerName: "Honeycomb", text: "Hello.", how: null, key: null },
    ]);
    expect(replayLines({ id: "2", kind: "narration", text: " Rain starts. " }, ROSIE)).toEqual([
      { role: "narrator", speakerId: null, speakerName: NARRATOR_NAME, text: "Rain starts.", how: null, key: null },
    ]);
  });

  // Bug caught: the player's line asked for with nobody played (no speaker to cast).
  it("has nothing to say for the player's line when nobody is played", () => {
    expect(replayLines(items[0], null)).toEqual([]);
  });
});
