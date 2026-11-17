import { describe, expect, it } from "vitest";
import { parseBody, playerText } from "./turnBody";

describe("a question to the Dungeon Master", () => {
  // Bug caught live (17 Nov 2026): "am I alone here now?" could only be sent as words the character says, and was
  // answered as speech into an empty room instead of by the Dungeon Master.
  it("is read as the player's question, which nobody in the story hears", () => {
    const text = playerText("ask", "Am I alone here now?");
    expect(text).toContain("out of character");
    expect(text).toContain("nobody in the story hears it");
    expect(text).toContain("Am I alone here now?");
    expect(text).not.toContain("says aloud");
  });

  // Bug caught: the page's Ask button refused by the server as a request that is not valid.
  it("is a mode a request may carry, and an unknown mode is still refused", () => {
    const body = { campaignId: "00000000-0000-4000-8000-0000000000c1", message: "What can I see?" };
    expect(parseBody({ ...body, mode: "ask" }).ok).toBe(true);
    expect(parseBody({ ...body, mode: "shout" }).ok).toBe(false);
  });
});
