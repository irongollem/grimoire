import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useAskPrefillStore } from "@/stores/ui/askPrefill";
import { offerToldStory } from "./useAskInterview";

describe("offerToldStory", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // Bug caught: the story offered to the wrong screen, or without "own writing" and a name (the DM would paste a
  // told story as if it were a published book, and its scenes would be put in other words).
  it("leaves the story for the document import with own writing and a name, and says where it is", () => {
    expect(offerToldStory("I said: hi")).toBe("/canon/import");
    expect(useAskPrefillStore().takeOffer("document_import")).toEqual({ text: "I said: hi", inputs: { ownWriting: "true", displayName: "Told to the Familiar" } });
  });
});
