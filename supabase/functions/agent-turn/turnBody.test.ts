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

describe("someone else's turn in a fight", () => {
  const base = { campaignId: "00000000-0000-4000-8000-0000000000c1", sessionId: "00000000-0000-4000-8000-0000000000a1", message: "", mode: "do" };

  // Bug caught: the page's request for a helper's turn refused as an empty message.
  it("is a turn without words, in a conversation that exists", () => {
    expect(parseBody({ ...base, helperTurn: { name: " Apprentice Honeycomb " } })).toMatchObject({ ok: true, body: { helperTurn: { name: "Apprentice Honeycomb" } } });
  });

  // Bug caught: a helper's turn used to open a new conversation, or carrying the player's own words or roll.
  it.each([
    ["no conversation", { ...base, sessionId: undefined, helperTurn: { name: "Honeycomb" } }],
    ["words of the player's", { ...base, message: "I attack", helperTurn: { name: "Honeycomb" } }],
    ["no name", { ...base, helperTurn: { name: "  " } }],
    ["a name that is not text", { ...base, helperTurn: { name: 7 } }],
    ["a name far too long", { ...base, helperTurn: { name: "x".repeat(121) } }],
  ])("is refused with %s", (_what, body) => {
    expect(parseBody(body).ok).toBe(false);
  });
});

describe("listening while the characters go on", () => {
  const base = { campaignId: "00000000-0000-4000-8000-0000000000c1", sessionId: "00000000-0000-4000-8000-0000000000a1", message: "", mode: "do" };

  // Bug caught: the page's request to let the characters go on refused as an empty message.
  it("is a turn without words, in a conversation that exists", () => {
    expect(parseBody({ ...base, listening: true })).toMatchObject({ ok: true, body: { listening: true } });
  });

  // Bug caught: words, a roll or another kind of wordless turn riding along with it, so one request means two things.
  it.each([
    ["no conversation", { ...base, sessionId: undefined, listening: true }],
    ["words of the player's", { ...base, message: "I cut in", listening: true }],
    ["an opening as well", { campaignId: base.campaignId, message: "", mode: "do", opening: true, listening: true }],
    ["anything but a literal true", { ...base, listening: "yes" }],
  ])("is refused with %s", (_what, body) => {
    expect(parseBody(body)).toEqual({ ok: false });
  });
});
