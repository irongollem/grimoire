import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { AskItem } from "@/composables/ask/askItems";
import { useAskPrefillStore } from "@/stores/ui/askPrefill";
import { composeStory, hasTold, offerToldStory } from "./askInterviewStory";

const reply = (id: number, text: string): AskItem => ({ kind: "reply", id, text, who: null });
const user = (id: number, text: string): AskItem => ({ kind: "user", id, text });

describe("composeStory", () => {
  // Bug caught: the DM's words trimmed, summarised or reordered; or a message left without the question it answered.
  it("keeps each of the DM's messages verbatim, in order, after the Familiar's question it answered", () => {
    const items = [reply(5, "Where does it happen?"), user(6, "  On a drowned coast.\nSalt everywhere. "), reply(7, "Who is in it?"), user(8, "A smuggler queen.")];
    expect(composeStory(items, 5)).toBe(
      "The Familiar asked: Where does it happen?\n\nI said: On a drowned coast.\nSalt everywhere.\n\nThe Familiar asked: Who is in it?\n\nI said: A smuggler queen.",
    );
  });

  // Bug caught: the walk's questions and answers, or a generation's result card, leaking into the told story.
  it("leaves walk items, results and errors out", () => {
    const stop = { step: "pitch", memberId: null, memberName: null } as const;
    const items: AskItem[] = [
      { kind: "walk-question", id: 5, stop, text: "What is the pitch?", answered: true },
      reply(6, "Tell me."),
      { kind: "error", id: 7, message: "Could not answer" },
      user(8, "A siege."),
      { kind: "walk-block", id: 9, stop, answer: "ignored", phase: "saved" },
    ];
    expect(composeStory(items, 5)).toBe("The Familiar asked: Tell me.\n\nI said: A siege.");
  });

  // Bug caught: what was said before the interview began (an earlier chat in the thread) becoming part of the story.
  it("starts at the interview's own opening, not earlier in the thread", () => {
    const items = [user(1, "Earlier question"), reply(2, "Earlier answer"), reply(3, "Tell me."), user(4, "A siege.")];
    expect(composeStory(items, 3)).toBe("The Familiar asked: Tell me.\n\nI said: A siege.");
    expect(hasTold(items, 3)).toBe(true);
  });

  // Bug caught: Turn this into my canon enabled on an empty story, offering the Familiar's own invitation to the import.
  it("is null until the DM has said something", () => {
    const items = [reply(3, "Tell me.")];
    expect(composeStory(items, 3)).toBeNull();
    expect(hasTold(items, 3)).toBe(false);
  });
});

describe("offerToldStory", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // Bug caught: the story offered to the wrong screen, or without "own writing" and a name (the DM would paste a
  // told story as if it were a published book, and its scenes would be put in other words).
  it("leaves the story for the document import with own writing and a name, and says where it is", () => {
    expect(offerToldStory("I said: hi")).toBe("/canon/import");
    expect(useAskPrefillStore().takeOffer("document_import")).toEqual({ text: "I said: hi", inputs: { ownWriting: "true", displayName: "Told to the Familiar" } });
  });
});
